import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PaymentCatalogService } from '../services/payment-catalog.service';
import {
  CreatePaymentItemDto,
  PatchPaymentItemDto,
  CreatePaymentStructureDto,
  PatchPaymentStructureDto,
  ListPaymentCatalogQueryDto,
  PaymentItemResponseDto,
  PaymentStructureResponseDto,
} from '../dtos/payment-catalog.dto';
import { JwtAuthGuard, PermissionsGuard, RequirePermission } from '../../../utils';

@ApiTags('Payment Catalog')
@Controller()
export class PaymentCatalogController {
  constructor(private readonly paymentCatalogService: PaymentCatalogService) {}

  @Get(['finance/payment-items', 'payment-catalog/items'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('payments.pay_fees', 'payments.view', 'jupeb.finance.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List active payment items for fee checkout',
    description: 'Returns available fee types (affiliation, examination, fixed).',
  })
  @ApiOkResponse({ type: [PaymentItemResponseDto] })
  async listItems() {
    return this.paymentCatalogService.listActiveItems();
  }

  @Get(['finance/payment-structures', 'payment-catalog/structures'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('payments.pay_fees', 'payments.view', 'jupeb.finance.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List active payment structures for fee checkout',
    description: 'Returns payment modes (Full, Partial installment).',
  })
  @ApiOkResponse({ type: [PaymentStructureResponseDto] })
  async listStructures() {
    return this.paymentCatalogService.listActiveStructures();
  }

  @Get(['finance/admin/payment-items', 'payment-catalog/admin/items'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.finance.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List all payment items for administrative management',
    description: 'Paginated admin list of payment items.',
  })
  @ApiOkResponse({ type: [PaymentItemResponseDto] })
  async listAllItems(@Query() query: ListPaymentCatalogQueryDto) {
    return this.paymentCatalogService.listAllItems(query);
  }

  @Post(['finance/admin/payment-items', 'payment-catalog/admin/items'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.finance.manage')
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new payment item',
    description: 'Adds a fee catalog entry for billing.',
  })
  @ApiCreatedResponse({ type: PaymentItemResponseDto })
  async createItem(@Body() dto: CreatePaymentItemDto) {
    return this.paymentCatalogService.createItem(dto);
  }

  @Patch(['finance/admin/payment-items/:id', 'payment-catalog/admin/items/:id'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.finance.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update payment item properties',
    description: 'Modifies fee source, fixed amount, or status.',
  })
  @ApiOkResponse({ type: PaymentItemResponseDto })
  async updateItem(@Param('id') id: string, @Body() dto: PatchPaymentItemDto) {
    return this.paymentCatalogService.updateItem(id, dto);
  }

  @Delete(['finance/admin/payment-items/:id', 'payment-catalog/admin/items/:id'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.finance.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Delete payment item',
    description: 'Soft-deletes fee item from active catalog.',
  })
  @ApiOkResponse({ type: PaymentItemResponseDto })
  async deleteItem(@Param('id') id: string) {
    return this.paymentCatalogService.deleteItem(id);
  }

  @Get(['finance/admin/payment-structures', 'payment-catalog/admin/structures'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.finance.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'List all payment structures for admin management',
    description: 'Paginated list of payment structures.',
  })
  @ApiOkResponse({ type: [PaymentStructureResponseDto] })
  async listAllStructures(@Query() query: ListPaymentCatalogQueryDto) {
    return this.paymentCatalogService.listAllStructures(query);
  }

  @Post(['finance/admin/payment-structures', 'payment-catalog/admin/structures'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.finance.manage')
  @ApiBearerAuth('JWT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new payment structure',
    description: 'Registers a payment payment schedule option (e.g. full vs partial).',
  })
  @ApiCreatedResponse({ type: PaymentStructureResponseDto })
  async createStructure(@Body() dto: CreatePaymentStructureDto) {
    return this.paymentCatalogService.createStructure(dto);
  }

  @Patch(['finance/admin/payment-structures/:id', 'payment-catalog/admin/structures/:id'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.finance.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Update payment structure properties',
    description: 'Updates partial payment allowance or display name.',
  })
  @ApiOkResponse({ type: PaymentStructureResponseDto })
  async updateStructure(
    @Param('id') id: string,
    @Body() dto: PatchPaymentStructureDto,
  ) {
    return this.paymentCatalogService.updateStructure(id, dto);
  }

  @Delete(['finance/admin/payment-structures/:id', 'payment-catalog/admin/structures/:id'])
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('jupeb.finance.manage')
  @ApiBearerAuth('JWT')
  @ApiOperation({
    summary: 'Delete payment structure',
    description: 'Soft-deletes payment structure.',
  })
  @ApiOkResponse({ type: PaymentStructureResponseDto })
  async deleteStructure(@Param('id') id: string) {
    return this.paymentCatalogService.deleteStructure(id);
  }
}
