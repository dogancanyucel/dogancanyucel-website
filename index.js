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

    // --- ROTA 1b: GET /api/supplements?q=whey&limit=20 ---
    if (url.pathname === "/api/supplements" && request.method === "GET") {
      try {
        const apiKey = request.headers.get("x-api-key");
        if (!apiKey || apiKey !== env.ANDROID_API_KEY) {
          return new Response(JSON.stringify({ error: "Unauthorized: Invalid or missing API Key." }), {
            status: 401, headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        const q = (url.searchParams.get("q") || "").trim();
        if (q.length < 2) {
          return new Response(JSON.stringify({ error: "Query 'q' must be at least 2 characters." }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit")) || 20, 1), 50);
        const tokens = q
          .toLowerCase()
          .split(/[\s,+]+/)
          .map((t) => t.trim())
          .filter((t) => t.length >= 2)
          .slice(0, 6);

        if (tokens.length === 0) {
          return new Response(JSON.stringify({ error: "No usable search tokens." }), {
            status: 400, headers: { "Content-Type": "application/json", ...corsHeaders }
          });
        }

        // Match all tokens against name OR brand; prefer on-market + products with macros
        let sql =
          "SELECT id, name, brand, serving, calories, protein, carbs, fat, ingredients, off_market " +
          "FROM supplements WHERE 1=1";
        const params = [];
        for (const token of tokens) {
          sql += " AND (LOWER(name) LIKE ? OR LOWER(brand) LIKE ?)";
          const like = `%${token}%`;
          params.push(like, like);
        }
        sql +=
          " ORDER BY off_market ASC, " +
          "(CASE WHEN calories > 0 OR protein > 0 OR carbs > 0 OR fat > 0 THEN 0 ELSE 1 END) ASC, " +
          "LENGTH(name) ASC LIMIT ?";
        params.push(limit);

        const { results } = await env.DB.prepare(sql).bind(...params).all();

        return new Response(
          JSON.stringify({
            q,
            count: results.length,
            data: results,
            source: "NIH DSLD (slim)",
          }),
          { headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
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
        const senderName = formData.get("name") || "Anonymous User";
        const senderEmail = formData.get("email") || "Not provided";
        const senderMessage = formData.get("message") || "No message.";

        await env.EMAIL.send({
          to: "contact@dogancanyucel.com",
          from: { email: "noreply@dogancanyucel.com", name: "Website Contact Form" },
          subject: `New Contact Form Message: ${senderName}`,
          text: `Name: ${senderName}\nEmail: ${senderEmail}\n\nMessage:\n${senderMessage}`
        });

        return new Response(JSON.stringify({ success: true, message: "Your message was sent successfully." }), {
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