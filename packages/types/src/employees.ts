import { TenantUser, TenantRole } from './tenant';

export interface EmployeeDTO extends TenantUser {
  // Any additional employee-specific fields can go here
}

export interface CreateEmployeeDTO {
  name: string;
  email: string;
  password?: string;
  isActive?: boolean;
  roles: string[]; // Role slugs
  ownerConfirmationText?: string;
}

export interface UpdateEmployeeDTO extends Partial<CreateEmployeeDTO> {
  id: string;
}

export interface EmployeeRoleDTO extends TenantRole {
  // Any additional role-specific fields
}
