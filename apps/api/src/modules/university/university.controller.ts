import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
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
  @Get('faculties/:id/majors')
getMajorsByFaculty(
  @Param('id', new ParseUUIDPipe()) facultyId: string,
) {
  return this.universityService.findMajorsByFaculty(facultyId);
}
}