// Servidor da IA FATEC
// Serve a página e guarda chamadas e notas em dados.json.
// Uso:  node server.js          (PIN padrão 1234)
//       PROF_PIN=4321 PORT=8080 node server.js
// Requer apenas Node.js 16+, sem dependências.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const PIN = process.env.PROF_PIN || "1234";
const ARQ = path.join(__dirname, "dados.json");
const PAGINA = path.join(__dirname, "assistec.html");

function ler() {
  try {
    const d = JSON.parse(fs.readFileSync(ARQ, "utf8"));
    return { chamadas: Array.isArray(d.chamadas) ? d.chamadas : [], notas: d.notas || {} };
  } catch {
    return { chamadas: [], notas: {} };
  }
}

// Grava em arquivo temporário e renomeia, para não corromper dados.json se o processo cair no meio
function gravar(d) {
  const tmp = ARQ + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  fs.renameSync(tmp, ARQ);
}

function json(res, status, obj) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(obj));
}

function lerCorpo(req) {
  return new Promise((ok, falha) => {
    let b = "";
    req.on("data", (c) => {
      b += c;
      if (b.length > 1e6) { req.destroy(); falha(new Error("Corpo grande demais")); }
    });
    req.on("end", () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { falha(e); } });
    req.on("error", falha);
  });
}

const notaValida = (v) => v === null || (typeof v === "number" && v >= 0 && v <= 10);

http.createServer(async (req, res) => {
  const url = req.url.split("?")[0];
  try {
    if (req.method === "GET" && (url === "/" || url === "/assistec.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return fs.createReadStream(PAGINA).pipe(res);
    }

    if (req.method === "GET" && url === "/api/dados") return json(res, 200, ler());

    if (req.method === "POST" && url.startsWith("/api/")) {
      if (req.headers["x-prof-pin"] !== PIN) return json(res, 401, { erro: "PIN inválido" });
      const b = await lerCorpo(req);

      if (url === "/api/login") return json(res, 200, { ok: true });

      // Chamada: uma por turma + disciplina + data (salvar de novo substitui)
      if (url === "/api/chamadas") {
        const { turma, disciplina, data, aulas, faltas } = b;
        const valida = typeof turma === "string" && turma && typeof disciplina === "string" && disciplina &&
          /^\d{4}-\d{2}-\d{2}$/.test(data || "") && Number.isInteger(aulas) && aulas >= 1 && aulas <= 8 &&
          Array.isArray(faltas);
        if (!valida) return json(res, 400, { erro: "Chamada inválida" });

        const dados = ler();
        const id = `${turma}|${disciplina}|${data}`;
        dados.chamadas = dados.chamadas.filter((c) => c.id !== id);
        dados.chamadas.push({ id, turma, disciplina, data, aulas, faltas: faltas.map(String), salvoEm: new Date().toISOString() });
        gravar(dados);
        console.log(`Chamada salva: ${id} (${faltas.length} faltas)`);
        return json(res, 200, dados);
      }

      // Notas: { notas: { RA: { "Disciplina": { p1, p2 } } } }
      if (url === "/api/notas") {
        const entrada = b.notas && typeof b.notas === "object" ? b.notas : null;
        if (!entrada) return json(res, 400, { erro: "Notas inválidas" });

        const dados = ler();
        for (const [ra, discs] of Object.entries(entrada)) {
          for (const [disc, v] of Object.entries(discs || {})) {
            if (!v || !notaValida(v.p1) || !notaValida(v.p2)) return json(res, 400, { erro: `Nota inválida (RA ${ra})` });
            (dados.notas[ra] ||= {})[disc] = { p1: v.p1, p2: v.p2 };
          }
        }
        gravar(dados);
        console.log(`Notas salvas: ${Object.keys(entrada).length} alunos`);
        return json(res, 200, dados);
      }
    }

    json(res, 404, { erro: "Não encontrado" });
  } catch {
    json(res, 400, { erro: "Requisição inválida" });
  }
}).listen(PORT, () => {
  console.log(`IA FATEC rodando em http://localhost:${PORT}`);
  console.log(PIN === "1234" ? "PIN do professor: 1234 (troque com PROF_PIN=...)" : "PIN do professor definido por PROF_PIN");
});
