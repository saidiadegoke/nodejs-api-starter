import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { ModuleRef } from '@nestjs/core';
import { CommodLogger } from './commod-logger.service';
import { LoggerFactory } from './logger.factory';
import { resolveLogger } from './resolve-logger';

// Minimal stubs — config returns undefined for every key so the logger falls
// back to development defaults (Grafana disabled, all levels enabled) and never
// touches the network.
const httpStub = { post: jest.fn() } as unknown as HttpService;
const configStub = { get: () => undefined } as unknown as ConfigService;

// Built from a runtime ESC char so the source carries no control character
// (eslint no-control-regex) while still stripping `\x1b[NNm` colour codes.
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[\\d+m`, 'g');

function capture(stream: 'stdout' | 'stderr', fn: () => void): string {
  const lines: string[] = [];
  const spy = jest
    .spyOn(process[stream], 'write')
    .mockImplementation((chunk: any) => {
      lines.push(String(chunk));
      return true;
    });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
  return lines.join('').replace(ANSI, '');
}

function captureStdout(fn: () => void): string {
  return capture('stdout', fn);
}

describe('CommodLogger', () => {
  describe('context isolation (transient scope)', () => {
    it('keeps each instance context independent', () => {
      const a = new CommodLogger(httpStub, configStub);
      const b = new CommodLogger(httpStub, configStub);
      a.setContext('ServiceA');
      b.setContext('ServiceB');

      const outA = captureStdout(() => a.log('hello'));
      const outB = captureStdout(() => b.log('hello'));

      expect(outA).toContain('[ServiceA]');
      expect(outA).not.toContain('[ServiceB]');
      expect(outB).toContain('[ServiceB]');
      expect(outB).not.toContain('[ServiceA]');
    });
  });

  describe('INQUIRER auto-labelling', () => {
    it('defaults the context to the injecting class name', () => {
      class PaymentService {}
      const logger = new CommodLogger(
        httpStub,
        configStub,
        new PaymentService(),
      );

      const out = captureStdout(() => logger.log('charged'));

      expect(out).toContain('[PaymentService]');
    });

    it('ignores a bare object inquirer and stays context-less', () => {
      const logger = new CommodLogger(httpStub, configStub, {});
      const out = captureStdout(() => logger.log('msg'));
      // No "[Context]" bracket, so no [Word] token precedes the separator.
      expect(out).not.toMatch(/\[[A-Za-z]/);
    });

    it('lets an explicit setContext override the inquirer default', () => {
      class FooController {}
      const logger = new CommodLogger(
        httpStub,
        configStub,
        new FooController(),
      );
      logger.setContext('CustomContext');

      const out = captureStdout(() => logger.log('msg'));

      expect(out).toContain('[CustomContext]');
      expect(out).not.toContain('[FooController]');
    });
  });

  describe('trailing per-call context de-duplication', () => {
    it('drops a trailing arg that merely repeats the context', () => {
      const logger = new CommodLogger(httpStub, configStub);
      logger.setContext('KybService');

      const out = captureStdout(() =>
        logger.log('No PENDING ENTITY pass found', 'KybService'),
      );

      expect(out).toContain('[KybService]');
      expect(out).toContain('No PENDING ENTITY pass found');
      // The class name appears once (as the bracket context), not dangling in
      // the message text.
      const afterSeparator = out.split(' - ')[1] ?? '';
      expect(afterSeparator).not.toContain('KybService');
    });

    it('skips nullish args so error(msg, undefined, ctx) renders cleanly', () => {
      const logger = new CommodLogger(httpStub, configStub);
      logger.setContext('KybService');

      const out = capture('stderr', () =>
        logger.error('Pass has no transaction id', undefined, 'KybService'),
      );

      const afterSeparator = out.split(' - ')[1] ?? '';
      expect(afterSeparator.trim()).toBe('Pass has no transaction id');
    });

    it('keeps a trailing string that is NOT the context (real data)', () => {
      const logger = new CommodLogger(httpStub, configStub);
      logger.setContext('DealsService');

      const out = captureStdout(() => logger.log('deal', 'extra-detail'));

      expect(out).toContain('deal extra-detail');
    });
  });
});

describe('LoggerFactory', () => {
  it('mints independent loggers and applies the requested context', () => {
    const factory = new LoggerFactory(httpStub, configStub);
    const a = factory.create('Alpha');
    const b = factory.create('Beta');

    expect(a).not.toBe(b);
    expect(captureStdout(() => a.log('x'))).toContain('[Alpha]');
    expect(captureStdout(() => b.log('x'))).toContain('[Beta]');
  });

  it('creates a context-less logger when no context is passed', () => {
    const factory = new LoggerFactory(httpStub, configStub);
    const logger = factory.create();
    expect(captureStdout(() => logger.log('x'))).not.toMatch(/\[[A-Za-z]/);
  });
});

describe('resolveLogger', () => {
  it('mints a fresh logger via LoggerFactory in real runtime', () => {
    const sentinel = {} as CommodLogger;
    const moduleRef = {
      get: (token: unknown) =>
        token === LoggerFactory ? { create: () => sentinel } : undefined,
    } as unknown as ModuleRef;

    expect(resolveLogger(moduleRef)).toBe(sentinel);
  });

  it('falls back to moduleRef.get(CommodLogger) when LoggerFactory is absent (test mocks)', () => {
    const mockLogger = { log: jest.fn() } as unknown as CommodLogger;
    const moduleRef = {
      get: (token: unknown) => {
        if (token === LoggerFactory) throw new Error('Unknown provider');
        if (token === CommodLogger) return mockLogger;
        return undefined;
      },
    } as unknown as ModuleRef;

    expect(resolveLogger(moduleRef)).toBe(mockLogger);
  });
});
