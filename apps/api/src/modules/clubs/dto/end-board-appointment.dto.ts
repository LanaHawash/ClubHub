import { IsDateString } from 'class-validator';
export class EndBoardAppointmentDto { @IsDateString() endDate!: string; }
