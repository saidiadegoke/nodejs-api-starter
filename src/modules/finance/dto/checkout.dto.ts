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
  @ApiPropertyOptional({
    description: 'Institution UUID (inferred from user if omitted)',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

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
  @IsString()
  payment_item_id?: string;

  @ApiPropertyOptional({
    description: 'Payment item code or UUID (e.g. affiliation_fee, examination_fee)',
    example: 'affiliation_fee',
  })
  @IsOptional()
  @IsString()
  payment_item?: string;

  @ApiPropertyOptional({
    description: 'Payment structure UUID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsString()
  payment_structure_id?: string;

  @ApiPropertyOptional({
    description: 'Payment structure code or UUID (e.g. full, partial)',
    example: 'partial',
  })
  @IsOptional()
  @IsString()
  payment_structure?: string;

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
    description: 'Payment description',
    example: 'Q1 test payment',
  })
  @IsOptional()
  @IsString()
  description?: string;

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

export class UploadPaymentReceiptDto {
  @ApiPropertyOptional({
    description: 'Institution UUID (auto-inferred from authenticated institution user if omitted)',
    example: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
  })
  @IsOptional()
  @IsUUID('4')
  university_id?: string;

  @ApiPropertyOptional({
    description: 'Academic session UUID',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsUUID('4')
  session_id?: string;

  @ApiPropertyOptional({
    description: 'Payment item UUID or code (e.g. affiliation_fee, fee_affiliation, examination_fee)',
    example: 'affiliation_fee',
  })
  @IsOptional()
  @IsString()
  payment_item_id?: string;

  @ApiPropertyOptional({
    description: 'Payment item code or UUID (e.g. affiliation_fee, examination_fee)',
    example: 'affiliation_fee',
  })
  @IsOptional()
  @IsString()
  payment_item?: string;

  @ApiPropertyOptional({
    description: 'Payment structure UUID or code (Payment Structure, e.g. full, installment, per_student)',
    example: 'full',
  })
  @IsOptional()
  @IsString()
  payment_structure_id?: string;

  @ApiPropertyOptional({
    description: 'Payment structure code or UUID (e.g. full, installment, per_student)',
    example: 'full',
  })
  @IsOptional()
  @IsString()
  payment_structure?: string;

  @ApiProperty({
    description: 'Amount in NGN',
    example: 500000,
  })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({
    description: 'Description or notes (max 250 characters)',
    example: 'Affiliation fee payment for 2026/2027 session',
    maxLength: 250,
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Pre-uploaded receipt document URL (if uploaded via /files/upload)',
    example: 'https://fra1.digitaloceanspaces.com/utme-ibass/receipts/receipt-123.pdf',
  })
  @IsOptional()
  @IsString()
  receipt_url?: string;

  @ApiPropertyOptional({
    description: 'Pre-uploaded receipt file UUID (if uploaded via /files/upload)',
    example: 'd3b07384-d113-40f4-8a4e-379e4971c260',
  })
  @IsOptional()
  @IsString()
  receipt_file_id?: string;

  @ApiPropertyOptional({
    description: 'Bank teller / transaction reference number',
    example: 'TEL-20260930-9941',
  })
  @IsOptional()
  @IsString()
  transaction_ref?: string;

  @ApiPropertyOptional({
    description: 'Bank name paid into',
    example: 'Wema Bank (JUPEB Central)',
  })
  @IsOptional()
  @IsString()
  bank_name?: string;

  @ApiPropertyOptional({
    description: 'Payment date (ISO string or YYYY-MM-DD)',
    example: '2026-09-30',
  })
  @IsOptional()
  @IsString()
  payment_date?: string;
}

export class ConfirmPaymentDto {
  @ApiPropertyOptional({
    description: 'Updated payment status (confirmed is treated as an alias for successful)',
    enum: ['successful', 'confirmed', 'rejected', 'failed', 'pending'],
    example: 'successful',
    default: 'successful',
  })
  @IsOptional()
  @IsString()
  @IsIn(['successful', 'confirmed', 'rejected', 'failed', 'pending'])
  status?: string;

  @ApiPropertyOptional({
    description: 'Finance confirmation or rejection remarks',
    example: 'Payment verified and credited against Central account.',
  })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    description: 'Reason for payment rejection',
    example: 'Invalid bank teller receipt uploaded',
  })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    description: 'Rejection reason alias',
    example: 'Invalid bank teller receipt uploaded',
  })
  @IsOptional()
  @IsString()
  rejection_reason?: string;

  @ApiPropertyOptional({
    description: 'Actual verified amount (if different from initiated receipt amount)',
    example: 500000,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  confirmed_amount?: number;

  @ApiPropertyOptional({
    description: 'Audit or bank reconciliation reference',
    example: 'REC-2026-09-8831',
  })
  @IsOptional()
  @IsString()
  reconciliation_ref?: string;
}

