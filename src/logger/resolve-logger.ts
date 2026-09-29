import { ModuleRef } from '@nestjs/core';
import { CommodLogger } from './commod-logger.service';
import { LoggerFactory } from './logger.factory';

/**
 * Resolve a per-instance {@link CommodLogger} for imperative call sites that
 * only hold a {@link ModuleRef} — i.e. `ServiceAbstract` / `ServiceAbstractRepoless`,
 * which acquire their logger in the constructor (so async `moduleRef.resolve()`
 * is not an option) and whose subclasses immediately call `this.logger.setContext()`.
 *
 * Real runtime: `CommodLogger` is transient and cannot be `moduleRef.get()`'d,
 * so we mint a fresh isolated instance through the `@Global` `LoggerFactory`.
 *
 * Unit tests: the overwhelmingly common pattern is a fake `ModuleRef` whose
 * `.get(CommodLogger)` returns a mock logger and which knows nothing about
 * `LoggerFactory`. The fallback keeps those specs green without edits.
 */
export function resolveLogger(moduleRef: ModuleRef): CommodLogger {
  try {
    const factory = moduleRef.get(LoggerFactory, { strict: false });
    if (factory && typeof factory.create === 'function') {
      return factory.create();
    }
  } catch {
    // LoggerFactory not registered (e.g. a TestingModule that doesn't import
    // LoggerModule) — fall back to the legacy lookup the specs already stub.
  }
  return moduleRef.get(CommodLogger, { strict: false });
}
