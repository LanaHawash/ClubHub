import { IsUUID } from 'class-validator';

export class AssignSupervisorDto {
  @IsUUID()
  supervisorId!: string;
}
