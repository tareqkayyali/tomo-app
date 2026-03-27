import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { requireAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';

let openai: OpenAI | null = null;
function getOpenAI(): OpenAI {
  if (!openai) openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || 'not-set' });
  return openai;
}

export async function POST(req: NextRequest) {
  const auth = requireAuth(req);
  if ('error' in auth) return auth.error;

  try {
    if (!process.env.OPENAI_API_KEY) {
      logger.error('OPENAI_API_KEY not configured');
      return NextResponse.json({ error: 'Transcription service not configured' }, { status: 503 });
    }

    const formData = await req.formData();
    const audioFile = formData.get('audio');

    logger.info('Transcribe request received', {
      userId: auth.user.id,
      hasFile: !!audioFile,
      fileType: audioFile ? typeof audioFile : 'null',
      fileName: audioFile instanceof File ? audioFile.name : 'not-a-file',
      fileSize: audioFile instanceof File ? audioFile.size : 0,
    });

    if (!audioFile || !(audioFile instanceof File)) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // 5MB limit
    if (audioFile.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'Audio file too large (max 5MB)' }, { status: 413 });
    }

    // Convert File to a format OpenAI SDK accepts
    const arrayBuffer = await audioFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const file = new File([buffer], audioFile.name || 'voice.m4a', {
      type: audioFile.type || 'audio/m4a',
    });

    const transcription = await getOpenAI().audio.transcriptions.create({
      model: 'whisper-1',
      file: file,
      language: 'en',
      prompt: 'Tomo, training, football, soccer, padel, drill, session, recovery, readiness, ACWR, HRV, periodization',
    });

    logger.info('Voice transcription completed', {
      userId: auth.user.id,
      textLength: transcription.text.length,
      text: transcription.text.substring(0, 50),
    });

    return NextResponse.json({ text: transcription.text });
  } catch (err: any) {
    logger.error('Transcription error', {
      error: err.message,
      stack: err.stack?.substring(0, 200),
      userId: auth.user?.id,
    });
    return NextResponse.json({ error: err.message || 'Transcription failed' }, { status: 500 });
  }
}
