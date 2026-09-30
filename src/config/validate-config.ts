import { plainToClass } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { ClassConstructor } from 'class-transformer/types/interfaces';

function formatValidationErrors(errors: ValidationError[], parentPath = ''): string[] {
  const messages: string[] = [];
  for (const error of errors) {
    const propertyPath = parentPath ? `${parentPath}.${error.property}` : error.property;
    if (error.constraints) {
      const constraintMsgs = Object.values(error.constraints).join('; ');
      messages.push(`  - ${propertyPath}: ${constraintMsgs} (received: ${JSON.stringify(error.value)})`);
    }
    if (error.children && error.children.length > 0) {
      messages.push(...formatValidationErrors(error.children, propertyPath));
    }
  }
  return messages;
}

export function validateConfig<T extends object>(
  config: Record<string, unknown>,
  envVariablesClass: ClassConstructor<T>,
): T {
  const validatedConfig = plainToClass(envVariablesClass, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const errorDetails = formatValidationErrors(errors).join('\n');
    throw new Error(`\n❌ Configuration validation failed on application startup:\n${errorDetails}\n`);
  }
  return validatedConfig;
}
