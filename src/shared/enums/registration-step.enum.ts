export enum RegistrationNextStep {
  CLAIM_CODE = 'claim_code',
  CONFIRM_SUBJECTS = 'confirm_subjects',
  UPLOAD_DOCUMENTS = 'upload_documents',
  UPLOAD_BIOMETRICS = 'upload_biometrics',
  SUBMIT_FOR_REVIEW = 'submit_for_review',
  AWAIT_REVIEW = 'await_review',
  VIEW_DASHBOARD = 'view_dashboard',
  VIEW_REJECTION = 'view_rejection',
  RESTART = 'restart',
}
