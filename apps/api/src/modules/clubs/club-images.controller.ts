import {
  BadRequestException,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Res,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Response } from 'express';

import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { AccountRole } from '../../generated/prisma/client';

const IMAGE_DIR = join(
  process.cwd(),
  'uploads',
  'club-images',
);

type UploadedImage = {
  buffer: Buffer;
  mimetype: string;
};

function detectImage(buffer: Buffer) {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    )
  ) {
    return { extension: 'png', mime: 'image/png' };
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: 'jpg', mime: 'image/jpeg' };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { extension: 'webp', mime: 'image/webp' };
  }

  return null;
}

@Controller('clubs/images')
export class ClubImagesController {
  @Post('upload')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(AccountRole.DEANSHIP)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async upload(@UploadedFile() file?: UploadedImage) {
    if (!file?.buffer) {
      throw new BadRequestException('Choose an image.');
    }

    const detected = detectImage(file.buffer);

    if (!detected || detected.mime !== file.mimetype) {
      throw new BadRequestException(
        'Only valid JPG, PNG, and WebP images are accepted.',
      );
    }

    const filename = `${randomUUID()}.${detected.extension}`;

    await mkdir(IMAGE_DIR, { recursive: true });

    await writeFile(
      join(IMAGE_DIR, filename),
      file.buffer,
      { flag: 'wx' },
    );

    return {
      url: `/api/clubs/images/${filename}`,
    };
  }

  @Get(':filename')
  async getImage(
    @Param('filename') filename: string,
    @Res({ passthrough: true }) response: Response,
  ) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(png|jpg|webp)$/.test(
        filename,
      )
    ) {
      throw new NotFoundException('Image not found.');
    }

    let buffer: Buffer;

    try {
      buffer = await readFile(join(IMAGE_DIR, filename));
    } catch {
      throw new NotFoundException('Image not found.');
    }

    const extension = filename.split('.').pop();

    const mime =
      extension === 'png'
        ? 'image/png'
        : extension === 'webp'
          ? 'image/webp'
          : 'image/jpeg';

    response.setHeader('Content-Type', mime);
    response.setHeader('X-Content-Type-Options', 'nosniff');

    return new StreamableFile(buffer);
  }
}