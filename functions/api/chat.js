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
  // --- ajustes técnicos del agente (los usa el motor de abajo) ---
  dominios: ["https://aplus.creskio.com", "https://pabloagencia.github.io"],  // webs que pueden usar este chat; vacío = cualquiera (rellenar con el dominio de la web)
  idioma: "en",
  zona: "America/Denver",
  camposReserva: [{"name": "service", "meta": "servicio", "desc": "Service the customer is requesting", "required": true}],  // datos extra obligatorios al reservar
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
Before checking availability, ALWAYS ask what service they need (from the services list) if they haven't said it yet. Never book a generic slot without knowing what it's for.
When someone wants to book an appointment, ALWAYS offer BOTH options first:
  "How would you prefer to do it? I can find an available slot and book it right here, or if you prefer to talk to us first, text us at https://wa.me/${NEGOCIO.whatsapp} 💬"
If they choose to book here:
  1. Use get_available_slots with the correct date range the user asked for (e.g. if they say "next week", pass next week's Monday as start_date and the following Sunday as end_date).
  2. Show ONLY the EXACT slots returned by the tool — times and dates as-is. NEVER invent, guess or modify appointment times. If the tool returns no slots, say so and offer WhatsApp instead.
  3. Ask for name and email if you don't have them yet, then create the booking with create_booking. Required before booking: SERVICE needed, name and email — if anything is missing, ask for it explicitly and wait for the answer.
  4. Confirm with the exact day and time, and mention they will receive a confirmation email.
  5. After confirming add: "If you need to make any changes, text us at https://wa.me/${NEGOCIO.whatsapp}"
UNBREAKABLE RULE: you may only say the appointment is booked/confirmed AFTER receiving success:true as a real result from the create_booking tool. It is FORBIDDEN to say "done", "booked", "confirmed" or similar without having actually run create_booking successfully. If create_booking returns an error, say so naturally and offer WhatsApp as an alternative — never pretend it was booked.
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

// ============================================
// MOTOR DEL AGENTE — IGUAL PARA TODAS LAS WEBS (versión 29-oct-2026)
// Lo único que cambia entre negocios está arriba: NEGOCIO y SYSTEM_PROMPT.
// Novedades: Haiku 5.5 sin pensamiento, captura de contactos por email,
// reservas con día/hora calculados por el servidor, CORS y mensajes validados.
// ============================================

const DEFAULT_MODEL = 'claude-haiku-5-5'
const EN = (NEGOCIO.idioma || 'es') === 'en'
const ZONA = NEGOCIO.zona || (EN ? 'America/Denver' : 'Europe/Madrid')
const LOCALE = EN ? 'en-US' : 'es-ES'
const LIMITE_HORA = NEGOCIO.limiteHora || 10
const MAX_TOKENS = NEGOCIO.maxTokens || 600
const CAMPOS = NEGOCIO.camposReserva || []
const WA = NEGOCIO.whatsapp
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MS_DAY = 24 * 60 * 60 * 1000

const TXT = EN ? {
  limite: `You've reached the message limit for now. To continue, contact us directly: https://wa.me/${WA}`,
  tecnico: `Sorry, there was a technical issue. Contact us directly: https://wa.me/${WA}`,
  reserva: `I'm having trouble completing that. Please contact us directly: https://wa.me/${WA}`,
  slotsDesc: "Look up free appointment slots. Use it when the customer wants to book. Returns, per day, a 'label' (e.g. 'Monday November 2') and slots with 'time' (local time) and 'iso'.",
  bookDesc: "Create the appointment once the customer has confirmed the time and given their details.",
  leadDesc: "Save the contact details of someone who wants the team to get in touch with them without booking an appointment.",
  slotIso: "The 'iso' value of the chosen slot, copied exactly from get_available_slots.",
  name: "Customer's name", email: "Customer's email", contact: "Email or phone number",
  note: "What they need, ONLY if they said it themselves. Do not invent or assume needs.",
  resumen: "How the conversation went in 1-2 sentences, third person, separating (1) test questions and (2) what the visitor really said about their situation. Facts only, no sensitive data.",
  startDate: "Start date YYYY-MM-DD", endDate: "End date YYYY-MM-DD (max 7 days later)",
  extra: `
SCHEDULE RULES (technical):
- When showing slots use EXACTLY the "label" (day) and "time" returned by get_available_slots; never work out the weekday or the time zone yourself. To book, pass in slot_iso the "iso" of the chosen slot exactly as returned.
- If asked whether you are a person or a robot, say clearly that you are an AI assistant, and offer the WhatsApp link if they prefer to talk to a person.
LEAVING CONTACT DETAILS WITHOUT BOOKING:
- If the person prefers that the team contacts them (they give a name and a phone or email without booking), call save_lead with name, contact, note (what they need, only what they said) and resumen (how the conversation went, 1-2 sentences). You may only say you have passed their details on AFTER receiving success:true from save_lead; if it errors, offer the WhatsApp link. The first time you ask for their details, say in one short sentence that only the team will use them to get back to them about their enquiry. Never ask for or store health or other sensitive data; if the visitor mentions it, do not repeat it.`
} : {
  limite: `Has alcanzado el límite de mensajes por ahora. Para seguir hablando, escríbenos por WhatsApp: https://wa.me/${WA}`,
  tecnico: `Estoy teniendo un problema técnico ahora mismo. Escríbenos por WhatsApp y te atendemos: https://wa.me/${WA} 💬`,
  reserva: `Estoy teniendo problemas para completar la gestión. Escríbenos directamente por WhatsApp: https://wa.me/${WA} 💬`,
  slotsDesc: "Consulta huecos libres para cita. Úsala cuando el cliente quiera pedir cita. Devuelve, por día, un 'label' (ej. 'lunes 2 de noviembre') y huecos con 'time' (hora de Madrid) e 'iso'.",
  bookDesc: "Crea la cita cuando el cliente confirmó la hora y dio sus datos.",
  leadDesc: "Guarda los datos de contacto de alguien que quiere que el equipo le contacte sin reservar cita.",
  slotIso: "Valor 'iso' del hueco elegido, copiado tal cual de get_available_slots.",
  name: "Nombre del cliente", email: "Email del cliente", contact: "Email o teléfono",
  note: "Qué necesita, SOLO si lo ha dicho él. No inventes ni deduzcas necesidades.",
  resumen: "Cómo ha ido la conversación en 1-2 frases, en tercera persona, separando (1) preguntas de prueba y (2) lo que el visitante dijo de verdad sobre su situación. Solo hechos, sin datos sensibles.",
  startDate: "Fecha inicio en YYYY-MM-DD", endDate: "Fecha fin en YYYY-MM-DD (máximo 7 días después)",
  extra: `
REGLAS DE LA AGENDA (técnicas):
- Al mostrar huecos usa EXACTAMENTE el "label" (día) y la "time" (hora) que devuelve get_available_slots; nunca calcules tú el día de la semana ni la zona horaria. Para reservar, pasa en slot_iso el "iso" del hueco elegido tal cual.
- Si preguntan si eres una persona o un robot, di con claridad que eres un asistente de IA y ofrece el WhatsApp si prefieren hablar con una persona.
DEJAR DATOS SIN RESERVAR:
- Si la persona prefiere que el equipo le contacte (te da nombre y un teléfono o email sin reservar cita), llama a save_lead con name, contact, note (qué necesita, solo lo que haya dicho) y resumen (cómo ha ido la conversación, 1-2 frases). Solo puedes decir que has pasado sus datos DESPUÉS de recibir success:true de save_lead; si da error, ofrece el WhatsApp. La primera vez que se los pidas, di en una frase corta que solo los usará el equipo para contactarle sobre su consulta. No pidas ni guardes datos de salud ni otros datos sensibles; si el visitante los menciona, no los repitas.`
}

function buildTools() {
  const extraProps = {}
  const extraReq = []
  for (const c of CAMPOS) {
    extraProps[c.name] = { type: "string", description: c.desc }
    if (c.required) extraReq.push(c.name)
  }
  return [
    {
      name: "get_available_slots",
      description: TXT.slotsDesc,
      input_schema: {
        type: "object",
        properties: {
          start_date: { type: "string", description: TXT.startDate },
          end_date: { type: "string", description: TXT.endDate }
        },
        required: ["start_date", "end_date"]
      }
    },
    {
      name: "create_booking",
      description: TXT.bookDesc,
      input_schema: {
        type: "object",
        properties: {
          slot_iso: { type: "string", description: TXT.slotIso },
          attendee_name: { type: "string", description: TXT.name },
          attendee_email: { type: "string", description: TXT.email },
          ...extraProps
        },
        required: ["slot_iso", "attendee_name", "attendee_email", ...extraReq]
      }
    },
    {
      name: "save_lead",
      description: TXT.leadDesc,
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: TXT.name },
          contact: { type: "string", description: TXT.contact },
          note: { type: "string", description: TXT.note },
          resumen: { type: "string", description: TXT.resumen }
        },
        required: ["name", "contact"]
      }
    }
  ]
}
const tools = buildTools()

function labelDia(date) {
  return date.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', timeZone: ZONA }).replace(',', '')
}
function labelHora(date) {
  return date.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', timeZone: ZONA })
}

async function getAvailableSlots(input, calApiKey, eventTypeId) {
  const hoy = new Date()
  let start = new Date(`${input.start_date}T00:00:00Z`)
  let end = new Date(`${input.end_date}T00:00:00Z`)
  if (isNaN(start) || isNaN(end)) return { error: 'Invalid dates, use YYYY-MM-DD' }
  if (start < new Date(hoy.getTime() - MS_DAY)) start = hoy
  if (end <= start) end = new Date(start.getTime() + 7 * MS_DAY)
  if (end - start > 14 * MS_DAY) end = new Date(start.getTime() + 14 * MS_DAY)
  const ymd = d => d.toISOString().slice(0, 10)
  const url = `https://api.cal.com/v2/slots?eventTypeId=${eventTypeId}&start=${ymd(start)}&end=${ymd(end)}&timeZone=${ZONA}`
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${calApiKey}`, 'cal-api-version': '2024-09-04' }
  })
  const data = await res.json()
  if (!res.ok) return { error: 'Could not get slots' }
  const formatted = {}
  for (const [date, slots] of Object.entries(data.data || {})) {
    if (!slots.length) continue
    const huecos = slots.slice(0, 8).map(slot => {
      const d = new Date(slot.start)
      return { time: labelHora(d), iso: d.toISOString() }
    })
    formatted[date] = { label: labelDia(new Date(slots[0].start)), slots: huecos }
  }
  if (!Object.keys(formatted).length) return { available_slots: {}, aviso: 'No slots in those dates: try another week or offer the WhatsApp link' }
  return { available_slots: formatted }
}

async function createBooking(input, calApiKey, eventTypeId) {
  const name = String(input.attendee_name || '').trim()
  const email = String(input.attendee_email || '').trim()
  if (name.length < 2 || name.length > 80) return { error: 'Invalid name, ask again' }
  if (!EMAIL_RE.test(email) || email.length > 120) return { error: 'Invalid email, ask the customer to repeat it' }
  const inicio = new Date(input.slot_iso)
  if (isNaN(inicio)) return { error: 'Invalid slot: use the exact iso returned by get_available_slots' }
  if (inicio.getTime() < Date.now() + 30 * 60 * 1000) return { error: 'That slot is no longer available, look up slots again' }
  if (inicio.getTime() > Date.now() + 60 * MS_DAY) return { error: 'That slot is too far ahead, offer a closer one' }
  const metadata = {}
  for (const c of CAMPOS) {
    const valor = String(input[c.name] || '').trim().slice(0, 200)
    if (c.required && !valor) return { error: `Missing ${c.name}, ask for it before booking` }
    metadata[c.meta || c.name] = valor
  }
  const res = await fetch('https://api.cal.com/v2/bookings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${calApiKey}`,
      'cal-api-version': '2024-08-13'
    },
    body: JSON.stringify({
      eventTypeId: parseInt(eventTypeId),
      start: inicio.toISOString(),
      attendee: { name, email, timeZone: ZONA, language: EN ? 'en' : 'es' },
      metadata
    })
  })
  const data = await res.json()
  if (!res.ok) return { error: 'Could not create the booking (the slot may be taken): offer another slot or the WhatsApp link' }
  return {
    success: true,
    booking_id: data.data.uid,
    cuando: EN ? `${labelDia(inicio)} at ${labelHora(inicio)}` : `${labelDia(inicio)} a las ${labelHora(inicio)} (hora de Madrid)`,
    title: data.data.title
  }
}

// Guarda el contacto: se envía por email al negocio (Resend). Si falla, copia temporal de 30 días en KV.
async function saveLead(input, env) {
  const name = String(input.name || '').trim().slice(0, 80)
  const contact = String(input.contact || '').trim().slice(0, 120)
  const note = String(input.note || '').trim().slice(0, 300)
  const resumen = String(input.resumen || '').trim().slice(0, 500)
  const digits = contact.replace(/\D/g, '')
  const esEmail = EMAIL_RE.test(contact)
  const esTel = !esEmail && digits.length >= 7 && digits.length <= 15
  if (name.length < 2) return { error: 'Missing name' }
  if (!esEmail && !esTel) return { error: 'The contact is neither an email nor a phone number, ask again' }
  const lead = { name, contact, note, resumen, fecha: new Date().toISOString(), origen: `chat-${NEGOCIO.nombre}` }

  if (env.RESEND_API_KEY && env.LEAD_NOTIFY_TO && env.LEAD_FROM) {
    try {
      const primerNombre = name.split(/\s+/)[0]
      const cuando = new Date().toLocaleString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: ZONA })
      let comoContactar = contact
      if (esTel) {
        const num = digits.length === 9 && !EN ? `34${digits}` : digits.replace(/^00/, '')
        comoContactar = `${contact}  →  ${EN ? 'WhatsApp' : 'escríbele por WhatsApp'}: https://wa.me/${num}`
      }
      const lineas = EN
        ? ['Hi,', '', `${name} left their contact details in the ${NEGOCIO.nombre} chat and prefers that you get in touch instead of booking an appointment.`, '']
        : ['Hola,', '', `${name} ha dejado su contacto en el chat de ${NEGOCIO.nombre} y prefiere que le contactéis vosotros en vez de reservar cita.`, '']
      if (note) lineas.push(`${EN ? 'What they need' : 'Lo que necesita'}: ${note}`)
      if (resumen) lineas.push(`${EN ? 'How the conversation went' : 'Cómo fue la conversación'}: ${resumen}`)
      lineas.push('', `${EN ? 'How to reach them' : 'Cómo contactarle'}: ${comoContactar}`, '', `${EN ? 'Left on' : 'Lo dejó'} ${cuando}.`, '', `— ${EN ? 'The AI assistant of' : 'El asistente IA de'} ${NEGOCIO.nombre}`)
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: env.LEAD_FROM,
          to: [env.LEAD_NOTIFY_TO],
          ...(esEmail ? { reply_to: contact } : {}),
          subject: EN ? `${primerNombre} wants to be contacted (${NEGOCIO.nombre})` : `${primerNombre} quiere que le contactéis (${NEGOCIO.nombre})`,
          text: lineas.join('\n')
        })
      })
      if (res.ok) return { success: true }
    } catch (e) { /* cae a la copia temporal */ }
  }
  if (env.RATE_LIMIT_KV) {
    try {
      await env.RATE_LIMIT_KV.put(`lead:${lead.fecha}:${Math.random().toString(36).slice(2, 8)}`, JSON.stringify(lead), { expirationTtl: 30 * 24 * 3600 })
      return { success: true }
    } catch (e) { /* sin ninguna vía */ }
  }
  return { error: 'Could not save the contact: offer the WhatsApp link' }
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
  if (ipCount >= LIMITE_HORA || sessionCount >= LIMITE_HORA || globalCount >= 300) return false
  await Promise.all([
    kv.put(`ip:${ip}:${hour}`, String(ipCount + 1), { expirationTtl: 3600 }),
    kv.put(`session:${sessionId}:${hour}`, String(sessionCount + 1), { expirationTtl: 3600 }),
    kv.put(`global:${day}`, String(globalCount + 1), { expirationTtl: 86400 })
  ])
  return true
}

// Solo mensajes de texto de usuario/asistente: nadie puede colar bloques de herramientas ni mensajes enormes.
function sanitizeMessages(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null
  const limpios = []
  for (const m of raw.slice(-14)) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null
    const content = m.content.trim().slice(0, 1200)
    if (!content) return null
    limpios.push({ role: m.role, content })
  }
  while (limpios.length && limpios[0].role !== 'user') limpios.shift()
  if (!limpios.length || limpios[limpios.length - 1].role !== 'user') return null
  return limpios
}

// Orígenes permitidos: NEGOCIO.dominios (o la variable ALLOWED_ORIGINS del Worker). Si no hay ninguno, se permite cualquiera.
function origenesPermitidos(env) {
  if (env && env.ALLOWED_ORIGINS) return env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean)
  return NEGOCIO.dominios || []
}
function corsHeaders(request, env) {
  const permitidos = origenesPermitidos(env)
  const base = { 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Vary': 'Origin' }
  if (!permitidos.length) return { ...base, 'Access-Control-Allow-Origin': '*' }
  const origin = request && request.headers.get('Origin')
  return { ...base, 'Access-Control-Allow-Origin': origin && permitidos.includes(origin) ? origin : permitidos[0] }
}
function origenPermitido(request, env) {
  const permitidos = origenesPermitidos(env)
  const origin = request.headers.get('Origin')
  if (!permitidos.length || !origin) return true
  return permitidos.includes(origin)
}

// Contador diario de uso (tokens y llamadas) para vigilar el coste real. No es crítico: si falla, se ignora.
async function recordUsage(kv, usage) {
  if (!kv) return
  try {
    const day = new Date().toISOString().slice(0, 10)
    const key = `usage:${day}`
    const prev = JSON.parse((await kv.get(key)) || '{}')
    const sum = (a, b) => (a || 0) + (b || 0)
    await kv.put(key, JSON.stringify({
      input: sum(prev.input, usage.input), output: sum(prev.output, usage.output),
      cacheWrite: sum(prev.cacheWrite, usage.cacheWrite), cacheRead: sum(prev.cacheRead, usage.cacheRead),
      calls: sum(prev.calls, usage.calls), messages: sum(prev.messages, 1)
    }), { expirationTtl: 90 * 24 * 3600 })
  } catch (e) { /* sin contador */ }
}

export async function onRequestPost(context) {
  const { request, env } = context
  const cors = corsHeaders(request, env)
  const json = (body, status = 200) => Response.json(body, { status, headers: cors })
  try {
    if (!origenPermitido(request, env)) return json({ error: 'origin not allowed' }, 403)
    const body = await request.json()
    const currentMessages = sanitizeMessages(body.messages)
    if (!currentMessages) return json({ error: 'messages invalid' }, 400)
    const sessionId = String(body.sessionId || 'anon').slice(0, 80)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
    const allowed = await checkRateLimit(env.RATE_LIMIT_KV, ip, sessionId)
    if (!allowed) return json({ reply: TXT.limite })

    const today = new Date().toLocaleDateString(LOCALE, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: ZONA })
    const fecha = EN ? `\n\nCURRENT DATE: Today is ${today}. Use it to work out relative dates.` : `\n\nFECHA ACTUAL: Hoy es ${today}. Úsala para calcular fechas relativas.`
    const systemFull = SYSTEM_PROMPT + '\n' + TXT.extra + fecha
    const model = env.MODEL || DEFAULT_MODEL
    const extra = model.startsWith('claude-haiku-5') ? { thinking: { type: 'disabled' } } : {}
    const MAX_TOOL_ROUNDS = 5
    const usage = { input: 0, output: 0, cacheWrite: 0, cacheRead: 0, calls: 0 }

    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_TOKENS,
          system: [{ type: "text", text: systemFull, cache_control: { type: "ephemeral" } }],
          messages: currentMessages,
          tools,
          ...extra
        })
      })
      const data = await response.json()
      if (!response.ok) return json({ reply: TXT.tecnico })
      const u = data.usage || {}
      usage.input += u.input_tokens || 0
      usage.output += u.output_tokens || 0
      usage.cacheWrite += u.cache_creation_input_tokens || 0
      usage.cacheRead += u.cache_read_input_tokens || 0
      usage.calls++
      if (data.stop_reason !== 'tool_use') {
        await recordUsage(env.RATE_LIMIT_KV, usage)
        const textBlock = data.content.find(b => b.type === 'text' && b.text && b.text.trim())
        return json({ reply: textBlock ? textBlock.text : TXT.tecnico })
      }
      if (round === MAX_TOOL_ROUNDS) {
        await recordUsage(env.RATE_LIMIT_KV, usage)
        return json({ reply: TXT.reserva })
      }
      const toolUse = data.content.find(b => b.type === 'tool_use')
      let toolResult
      try {
        if (toolUse.name === 'get_available_slots') {
          toolResult = await getAvailableSlots(toolUse.input || {}, env.CAL_API_KEY, env.CAL_EVENT_TYPE_ID)
        } else if (toolUse.name === 'create_booking') {
          toolResult = await createBooking(toolUse.input || {}, env.CAL_API_KEY, env.CAL_EVENT_TYPE_ID)
        } else if (toolUse.name === 'save_lead') {
          toolResult = await saveLead(toolUse.input || {}, env)
        } else {
          toolResult = { error: 'Tool not found' }
        }
      } catch (e) {
        toolResult = { error: 'Internal tool failure: offer the WhatsApp link' }
      }
      currentMessages.push({ role: 'assistant', content: data.content })
      currentMessages.push({
        role: 'user',
        content: [{ type: 'tool_result', tool_use_id: toolUse.id, content: JSON.stringify(toolResult) }]
      })
    }
  } catch (error) {
    return json({ reply: TXT.tecnico })
  }
}

export async function onRequestOptions(context) {
  const request = context && context.request
  const env = context && context.env
  if (request && !origenPermitido(request, env)) return new Response(null, { status: 403 })
  return new Response(null, { headers: corsHeaders(request, env) })
}
