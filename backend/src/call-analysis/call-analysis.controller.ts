import { Body, Controller, Delete, Get, Param, Post, Query, Req, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';
import { CallAnalysisService } from './call-analysis.service';

type JwtUser = { id: string; role: string; fullName?: string };

@Controller('call-analysis')
@UseGuards(AuthGuard('jwt'))
export class CallAnalysisController {
  constructor(private readonly service: CallAnalysisService) {}

  @Post('transcribe')
  @UseInterceptors(FileInterceptor('audio', {
    storage: memoryStorage(),
    fileFilter: (_req, file, cb) => {
      const allowed = /\.(mp3|wav|m4a|aac|ogg|flac|mp4|wma)$/i;
      if (allowed.test(file.originalname)) cb(null, true);
      else cb(new Error('Unsupported file type'), false);
    },
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  }))
  transcribe(@UploadedFile() file: Express.Multer.File) {
    return this.service.transcribe(file);
  }

  @Post('analyze')
  analyze(@Body() body: any) {
    return this.service.analyze(body);
  }

  @Post()
  create(@Req() req: Request & { user: JwtUser }, @Body() body: any) {
    return this.service.create(req.user, body);
  }

  @Get('leaderboard')
  leaderboard(@Req() req: Request & { user: JwtUser }) {
    return this.service.leaderboard(req.user);
  }

  @Get()
  findAll(
    @Req() req: Request & { user: JwtUser },
    @Query('agentId') agentId?: string,
    @Query('grade') grade?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.service.findAll(req.user, { agentId, grade, from, to });
  }

  @Get(':id')
  findOne(@Req() req: Request & { user: JwtUser }, @Param('id') id: string) {
    return this.service.findOne(req.user, id);
  }

  @Delete(':id')
  remove(@Req() req: Request & { user: JwtUser }, @Param('id') id: string) {
    return this.service.remove(req.user, id);
  }
}
