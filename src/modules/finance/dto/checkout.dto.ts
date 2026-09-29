import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsNumber,
  Min,
  IsIn,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateCheckoutDto {
  @ApiPropertyOptional({
    description: 'Registration UUID (defaults to latest active registration)',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  registration_id?: string;

  @ApiPropertyOptional({
    description: 'Payment item UUID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  payment_item_id?: string;

  @ApiPropertyOptional({
    description: 'Payment structure UUID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  payment_structure_id?: string;

  @ApiPropertyOptional({
    description: 'Payment method name/slug',
    example: 'paystack',
  })
  @IsOptional()
  @IsString()
  payment_method?: string;

  @ApiPropertyOptional({
    description: 'Payment method UUID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  payment_method_id?: string;

  @ApiPropertyOptional({
    description: 'Payment amount if not fixed by item',
    example: 25000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Payment gateway processor',
    enum: ['paystack', 'flutterwave', 'remita', 'direct_transfer'],
    example: 'paystack',
  })
  @IsOptional()
  @IsString()
  @IsIn(['paystack', 'flutterwave', 'remita', 'direct_transfer'])
  processor?: string;
}

export class CreateInstitutionCheckoutDto {
  @ApiProperty({
    description: 'Institution UUID',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @IsUUID('4')
  @IsNotEmpty()
  university_id: string;

  @ApiPropertyOptional({
    description: 'Academic session UUID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({
    description: 'Payment item UUID (e.g. affiliation fee or exam fees)',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  payment_item_id?: string;

  @ApiPropertyOptional({
    description: 'Payment structure UUID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  payment_structure_id?: string;

  @ApiPropertyOptional({
    description: 'Payment amount',
    example: 500000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount?: number;

  @ApiPropertyOptional({
    description: 'Payment method name/slug',
    example: 'bank_transfer',
  })
  @IsOptional()
  @IsString()
  payment_method?: string;

  @ApiPropertyOptional({
    description: 'Payment method UUID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  payment_method_id?: string;

  @ApiPropertyOptional({
    description: 'Processor',
    enum: ['paystack', 'flutterwave', 'remita', 'direct_transfer'],
    example: 'direct_transfer',
  })
  @IsOptional()
  @IsString()
  @IsIn(['paystack', 'flutterwave', 'remita', 'direct_transfer'])
  processor?: string;
}

export class ReconcilePaymentDto {
  @ApiProperty({
    description: 'Status snapshot',
    enum: ['pending', 'successful', 'failed', 'refunded'],
    example: 'successful',
  })
  @IsString()
  @IsIn(['pending', 'successful', 'failed', 'refunded'])
  status_snapshot: string;

  @ApiProperty({
    description: 'Captured amount in major units',
    example: 25000,
  })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  captured_amount: number;

  @ApiPropertyOptional({ example: 'NGN', default: 'NGN' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'TXN-REF-12345678' })
  @IsOptional()
  @IsString()
  gateway_reference?: string;

  @ApiPropertyOptional({
    description: 'Payment UUID to link',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  payment_id?: string;
}
