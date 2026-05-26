// ============================================
// CONFIGURACIÓN DEL NEGOCIO — EDITAR SOLO ESTO
// ============================================
const NEGOCIO = {
  nombre: "A Plus Auto Center",
  tipo: "auto repair shop",
  ciudad: "Salt Lake City, UT",
  direccion: "945 Gale St, Salt Lake City, UT 84101",
  telefono: "(801) 533-0389",
  telefono2: "",
  whatsapp: "18015330389",
  horario: "Monday through Saturday, 9:00 AM to 6:30 PM. Closed on Sundays.",
  web: "",
  maps: "https://maps.google.com/?q=A+Plus+Auto+Center+Salt+Lake+City",
  valoracion: "Trusted by 500+ customers",
  servicios: `Engine diagnostics, brake repair, oil change, emissions check, general maintenance and repairs for any make and model including gas, diesel and hybrid vehicles. Upfront written estimate before starting any work.`,
  instrucciones_extra: `Always mention that we provide a written estimate before starting any repair — this is our main differentiator. If someone asks about turnaround time, explain that a diagnostic or oil change can be ready in a few hours, while complex repairs may take a day or more, and we always give a specific completion date and stick to it.`
}
// ============================================
// FIN CONFIGURACIÓN — NO EDITAR LO DE ABAJO
// ============================================

const SYSTEM_PROMPT = `You are the virtual assistant of ${NEGOCIO.nombre}, ${NEGOCIO.tipo} in ${NEGOCIO.ciudad}.

LANGUAGE: You ALWAYS respond in English, no matter what language the user writes in. Even if they write in Spanish, French, or any other language — your reply is ALWAYS in English.

IDENTITY: Always speak in first person plural: "our shop", "we do", "we offer", "we are". NEVER use third person.

BUSINESS INFO:
- Address: ${NEGOCIO.direccion}
- Phone: ${NEGOCIO.telefono}${NEGOCIO.telefono2 ? ' / ' + NEGOCIO.telefono2 : ''}
- Hours: ${NEGOCIO.horario}
${NEGOCIO.web ? `- Website: ${NEGOCIO.web}` : ''}
${NEGOCIO.maps ? `- Google Maps: ${NEGOCIO.maps}` : ''}
${NEGOCIO.valoracion ? `- Reputation: ${NEGOCIO.valoracion}` : ''}

SERVICES:
${NEGOCIO.servicios}

APPOINTMENTS — REQUIRED FLOW:
When someone wants to book an appointment, ALWAYS offer BOTH options first:
  "How would you prefer to do it? I can find an available slot and book it right here, or if you prefer to talk to us first, text us at https://wa.me/${NEGOCIO.whatsapp} 💬"
If they choose to book here:
  1. Use get_available_slots with the correct date range the user asked for (e.g. if they say "next week", pass next week's Monday as start_date and the following Sunday as end_date).
  2. Show ONLY the EXACT slots returned by the tool — times and dates as-is. NEVER invent, guess or modify appointment times. If the tool returns no slots, say so and offer WhatsApp instead.
  3. Ask for name and email, then create the booking with create_booking.
  4. Confirm with the exact day and time, and mention they will receive a confirmation email.
  5. After confirming add: "If you need to make any changes, text us at https://wa.me/${NEGOCIO.whatsapp}"
NEVER mention "Cal.com" or any external software. Say "our schedule" or "right here".

INSTRUCTIONS:
- If they ask for directions, share the Google Maps link
- If you don't know the exact price, give a general estimate and refer them to the phone
- NEVER make up information — especially NEVER invent appointment times or dates
- If there's urgency, give the direct phone number
${NEGOCIO.instrucciones_extra}

STRICT FORMAT:
- NEVER use markdown: no asterisks (*), no ## headings, no dashes (-) for lists
- For emphasis use CAPS
- You may use emojis when natural
- Maximum 3 sentences unless the situation requires more`

const tools = [
  {
    name: "get_available_slots",
    description: "Check available appointment slots. Use it when the customer wants to book an appointment. Always pass the exact date range the customer asked for: if they say 'next week', use next Monday as start_date and next Sunday as end_date. If they say 'this week', use today as start_date and the coming Saturday as end_date.",
    input_schema: {
      type: "object",
      properties: {
        start_date: { type: "string", description: "Start date in YYYY-MM-DD. Must match what the user requested (e.g. next Monday for 'next week')." },
        end_date: { type: "string", description: "End date in YYYY-MM-DD. Typically 6-7 days after start_date." }
      },
      required: ["start_date", "end_date"]
    }
  },
  {
    name: "create_booking",
    description: "Create the appointment once the customer confirmed time, name and email.",
    input_schema: {
      type: "object",
      properties: {
        start_datetime: { type: "string", description: "Date and time in ISO 8601 UTC. Mountain Time (MDT) = UTC-6 (9:00 AM Denver = 15:00Z)" },
        attendee_name: { type: "string", description: "Customer name" },
        attendee_email: { type: "string", description: "Customer email" }
      },
      required: ["start_datetime", "attendee_name", "attendee_email"]
    }
  }
]

function fetchWithTimeout(url, options, ms = 8000) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ms)
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

async function getAvailableSlots(input, calApiKey, eventTypeId) {
  if (!calApiKey || !eventTypeId) return { error: 'Booking not configured' }
  const url = `https://api.cal.eu/v2/slots?eventTypeId=${eventTypeId}&start=${input.start_date}&end=${input.end_date}&timeZone=America/Denver`
  try {
    const res = await fetchWithTimeout(url, {
      headers: { 'Authorization': `Bearer ${calApiKey}`, 'cal-api-version': '2024-09-04' }
    })
    const data = await res.json()
    if (!res.ok) return { error: 'Could not retrieve available slots', details: data }
    const formatted = {}
    for (const [date, slots] of Object.entries(data.data)) {
      formatted[date] = slots.slice(0, 20).map(slot => ({
        time: new Date(slot.start).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Denver' }),
        iso: slot.start
      }))
    }
    return { available_slots: formatted }
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'Slot lookup timed out' : 'Could not retrieve available slots' }
  }
}

async function createBooking(input, calApiKey, eventTypeId) {
  if (!calApiKey || !eventTypeId) return { error: 'Booking not configured' }
  try {
    const res = await fetchWithTimeout('https://api.cal.eu/v2/bookings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${calApiKey}`,
        'cal-api-version': '2024-08-13'
      },
      body: JSON.stringify({
        eventTypeId: parseInt(eventTypeId),
        start: input.start_datetime,
        attendee: { name: input.attendee_name, email: input.attendee_email, timeZone: 'America/Denver', language: 'en' },
        metadata: {}
      })
    })
    const data = await res.json()
    if (!res.ok) return { error: 'Could not create the booking', details: data }
    return { success: true, booking_id: data.data.uid, start: data.data.start, title: data.data.title }
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'Booking request timed out' : 'Could not create the booking' }
  }
}

async function checkRateLimit(kv, ip, sessionId) {
  if (!kv) return true
  const now = new Date()
  const hour = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${now.getUTCHours()}`
  const day = `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}`
  const [ipCount, sessionCount, globalCount] = await Promise.all([
    kv.get(`ip:${ip}:${hour}`).then(v => parseInt(v || '0')),
    kv.get(`session:${sessionId}:${hour}`).then(v => parseInt(v || '0')),
    kv.get(`global:${day}`).then(v => parseInt(v || '0'))
  ])
  if (ipCount >= 10 || sessionCount >= 10 || globalCount >= 300) return false
  await Promise.all([
    kv.put(`ip:${ip}:${hour}`, String(ipCount + 1), { expirationTtl: 3600 }),
    kv.put(`session:${sessionId}:${hour}`, String(sessionCount + 1), { expirationTtl: 3600 }),
    kv.put(`global:${day}`, String(globalCount + 1), { expirationTtl: 86400 })
  ])
  return true
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const { messages, sessionId } = await request.json()
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    const allowed = await checkRateLimit(env.RATE_LIMIT_KV, ip, sessionId || 'anon')
    if (!allowed) {
      return Response.json(
        { reply: `You've reached the message limit for now. To continue, contact us directly: https://wa.me/${NEGOCIO.whatsapp}` },
        { headers: { 'Access-Control-Allow-Origin': '*' } }
      )
    }
    if (!messages || !Array.isArray(messages)) {
      return Response.json({ error: 'messages array required' }, { status: 400 })
    }
    let currentMessages = [...messages]
    if (currentMessages.length > 12) {
      currentMessages = currentMessages.slice(-12)
      while (
        currentMessages.length > 0 &&
        (currentMessages[0].role !== 'user' ||
          (Array.isArray(currentMessages[0].content) && currentMessages[0].content[0]?.type === 'tool_result'))
      ) {
        currentMessages = currentMessages.slice(1)
      }
    }
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'America/Denver' })
    const systemWithDate = SYSTEM_PROMPT + `\n\nTODAY'S DATE: Today is ${today}. Use it to calculate relative dates.`
    let iterations = 0
    while (true) {
      if (iterations++ >= 5) {
        return Response.json(
          { reply: `Sorry, there was a technical issue. Contact us directly: https://wa.me/${NEGOCIO.whatsapp}` },
          { headers: { 'Access-Control-Allow-Origin': '*' } }
        )
      }
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 600,
          system: [{ type: "text", text: systemWithDate, cache_control: { type: "ephemeral" } }],
          messages: currentMessages,
          tools
        })
      })
      const data = await response.json()
      if (!response.ok) return Response.json({ error: data }, { status: 500 })
      if (data.stop_reason !== 'tool_use') {
        const textBlock = data.content.find(b => b.type === 'text')
        return Response.json(
          { reply: textBlock ? textBlock.text : 'Sorry, something went wrong.' },
          { headers: { 'Access-Control-Allow-Origin': '*' } }
        )
      }
      const toolUse = data.content.find(b => b.type === 'tool_use')
      let toolResult
      if (toolUse.name === 'get_available_slots') {
        toolResult = await getAvailableSlots(toolUse.input, env.CAL_API_KEY, env.CAL_EVENT_TYPE_ID)
      } else if (toolUse.name === 'create_booking') {
        toolResult = await createBooking(toolUse.input, env.CAL_API_KEY, env.CAL_EVENT_TYPE_ID)
      } else {
        toolResult = { error: 'Tool not found' }
      }
      currentMessages.push({ role: 'assistant', content: data.content })
      currentMessages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(toolResult) }]
      })
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 })
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    }
  })
}
