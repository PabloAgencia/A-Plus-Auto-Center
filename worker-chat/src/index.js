// Envoltorio de Worker sobre la Pages Function del chat.
// No duplica logica: importa el mismo chat.js de siempre y solo traduce
// la forma de Pages (onRequestPost/onRequestOptions) a la de Worker.

import { onRequestPost, onRequestOptions } from "../../functions/api/chat.js"

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") return onRequestOptions()
    if (request.method === "POST") return onRequestPost({ request, env, ctx })
    return new Response("Backend del chat de la demo. Solo acepta POST.", {
      status: 405,
      headers: { "Access-Control-Allow-Origin": "*" },
    })
  },
}
