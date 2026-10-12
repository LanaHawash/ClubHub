import { Controller, Get } from '@nestjs/common';
import { UniversityService } from './university.service';

@Controller('university')
export class UniversityController {
  constructor(
    private readonly universityService: UniversityService,
  ) {}

  @Get('faculties')
  getFaculties() {
    return this.universityService.findAllFaculties();
  }

  @Get('majors')
  getMajors() {
    return this.universityService.findAllMajors();
  }
}