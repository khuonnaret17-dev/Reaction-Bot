import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { method, token, body } = await req.json();
    
    if (!token || !method) {
      return NextResponse.json({ ok: false, description: "Missing token or method" }, { status: 400 });
    }

    const url = `https://api.telegram.org/bot${token}/${method}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ ok: false, description: error.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get('token');
  const method = searchParams.get('method');
  
  if (!token || !method) {
     return NextResponse.json({ ok: false, description: "Missing token or method" }, { status: 400 });
  }

  const telegramParams = new URL(req.url).searchParams;
  telegramParams.delete('token');
  telegramParams.delete('method');

  const url = `https://api.telegram.org/bot${token}/${method}?${telegramParams.toString()}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ ok: false, description: error.message }, { status: 500 });
  }
}
