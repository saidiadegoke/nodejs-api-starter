import { Injectable } from '@nestjs/common';
import { INinProvider, NinVerificationResult } from '../providers/nin-provider.interface';
import { MockNinProvider } from '../providers/mock-nin.provider';
import { SpeedySmsNinProvider } from '../providers/speedysms-nin.provider';

@Injectable()
export class NinAdapterService {
  private readonly providers: Map<string, INinProvider> = new Map();

  constructor(
    mockProvider: MockNinProvider,
    speedySmsProvider: SpeedySmsNinProvider,
  ) {
    this.providers.set(mockProvider.name, mockProvider);
    this.providers.set(speedySmsProvider.name, speedySmsProvider);
  }

  resolveProviderName(): string {
    const raw = process.env.JUPEB_NIN_PROVIDER || process.env.NIN_PROVIDER;
    const name = (raw || 'speedysms').toLowerCase();
    return this.providers.has(name) ? name : 'speedysms';
  }

  getProvider(name?: string): INinProvider {
    const target = (name || this.resolveProviderName()).toLowerCase();
    const provider = this.providers.get(target);
    if (!provider) {
      throw new Error(`Unknown NIN provider: ${target}`);
    }
    return provider;
  }

  async verifyNin(
    normalizedNin: string,
    options: { provider?: string; force_fresh?: boolean } = {},
  ): Promise<{ provider_name: string; result: NinVerificationResult }> {
    const provider = this.getProvider(options.provider);
    const result = await provider.verifyNin(normalizedNin, options);
    return {
      provider_name: provider.name,
      result,
    };
  }
}
