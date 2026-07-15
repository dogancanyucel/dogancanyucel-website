export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-api-key"
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // --- ROTA 1: GET /api/exercises ---
    if (url.pathname === "/api/exercises" && request.method === "GET") {
      try {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey || apiKey !== env.ANDROID_API_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing API Key." }), {
            status: 401, headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        const target = url.searchParams.get("target");
        const bodyPart = url.searchParams.get("bodyPart");
        const limit = parseInt(url.searchParams.get("limit")) || 20;
        const page = parseInt(url.searchParams.get("page")) || 1;
        const offset = (page - 1) * limit;

        let query = "SELECT id, name, target, bodyPart, equipment, gifUrl, instructions FROM exercises WHERE 1=1";
        const queryParams = [];

        if (target) { query += " AND target = ?"; queryParams.push(target); }
        if (bodyPart) { query += " AND bodyPart = ?"; queryParams.push(bodyPart); }

        query += " LIMIT ? OFFSET ?";
        queryParams.push(limit, offset);

        const { results } = await env.DB.prepare(query).bind(...queryParams).all();

        return new Response(JSON.stringify({ page, limit, count: results.length, data: results }), {
          headers: { "Content-Type": "application/json", ...corsHeaders }
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    // --- ROTA 2: POST /api/feedback ---
    if (url.pathname === "/api/feedback" && request.method === "POST") {
      try {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey || apiKey !== env.ANDROID_API_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        const body = await request.json();
        const { email, message } = body;

        if (!message || message.trim() === "") {
          return new Response(JSON.stringify({ error: "Message required." }), { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        await env.DB.prepare("INSERT INTO feedbacks (user_email, message) VALUES (?, ?)").bind(email || "Anonymous", message).run();

        // Also forward to your personal inbox via Cloudflare Email Routing
        try {
          await env.EMAIL.send({
            to: "contact@dogancanyucel.com",
            from: { email: "noreply@dogancanyucel.com", name: "Turquoise App Feedback" },
            subject: `App Feedback from ${email || "Anonymous"}`,
            text: `From: ${email || "Anonymous"}\n\n${message}`
          });
        } catch (emailErr) {
          console.warn("Feedback saved to DB but email forward failed:", emailErr.message);
        }

        return new Response(JSON.stringify({ success: true }), { status: 201, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }

    // --- ROTA 3: POST /api/verify-email ---
    if (url.pathname === "/api/verify-email" && request.method === "POST") {
      try {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey || apiKey !== env.ANDROID_API_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized." }), { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } });
        }

        const body = await request.json();
        const { email, message } = body;

        // Cloudflare Email Sending binding (MailChannels ücretsiz Workers desteğini kapattı)
        await env.EMAIL.send({
          to: email,
          from: { email: "noreply@dogancanyucel.com", name: "Turquoise AI Calorie & Fitness" },
          subject: "Turquoise AI Calorie & Fitness",
          text: message
        });

        return new Response(JSON.stringify({ success: true }), { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } });
      }
    }
    // --- ROTA 4: POST /api/contact (Website İletişim Formu) ---
    if (url.pathname === "/api/contact" && request.method === "POST") {
      try {
        const formData = await request.formData();
        const senderName = formData.get("name") || "İsimsiz Kullanıcı";
        const senderEmail = formData.get("email") || "Belirtilmedi";
        const senderMessage = formData.get("message") || "Mesaj yok.";

        // Cloudflare Email Sending binding (MailChannels ücretsiz Workers desteğini kapattı)
        await env.EMAIL.send({
          to: "contact@dogancanyucel.com", // Kendi e-posta adresinizi buraya yazabilirsiniz
          from: { email: "noreply@dogancanyucel.com", name: "Website Contact Form" },
          subject: `Yeni İletişim Formu Mesajı: ${senderName}`,
          text: `Ad: ${senderName}\nE-posta: ${senderEmail}\n\nMesaj:\n${senderMessage}`
        });

        // Web sitesine başarılı dönüş (JSON formatında)
        return new Response(JSON.stringify({ success: true, message: "Mesajınız başarıyla gönderildi." }), { 
          status: 200, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
          status: 500, 
          headers: { "Content-Type": "application/json", ...corsHeaders } 
        });
      }
    }

    // --- STATİK DOSYALAR İÇİN HATA KORUMASI ---
    try {
      if (env.ASSETS) {
        return await env.ASSETS.fetch(request);
      }
    } catch (assetsError) {
      return new Response(`Static assets routing error: ${assetsError.message}`, { status: 500 });
    }

    return new Response("Not Found", { status: 404 });
  }
};