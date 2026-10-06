export enum RegistrationEvent {
  CODE_ISSUED = 'registration.code_issued',
}

export interface CodeIssuedEvent {
  registrationId: string;
  userId?: string | null;
}
