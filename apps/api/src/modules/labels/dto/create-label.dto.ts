import { IsString, Length, Matches } from 'class-validator';

export class CreateLabelDto {
  @IsString()
  @Length(2, 80)
  @Matches(/^[\p{L}\p{N}][\p{L}\p{N}\s&+.'/-]*$/u, {
    message: 'Label name contains unsupported characters.',
  })
  name!: string;
}