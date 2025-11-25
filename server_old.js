// server.js - backend completo VipCortes (MySQL local)
import express from 'express';
import cors from 'cors';
import path from 'path';
import { sequelize, Usuario, Agendamento, Review, Fidelidade } from './models/index.js';
import bcrypt from 'bcryptjs';
import fs from 'fs/promises';

const app = express();
const PORT = 10000;

// ----------- Middleware -----------
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const _dirname = path.resolve();

// Servir arquivos estáticos diretamente da raiz do projeto
app.use(express.static(_dirname));

// Rota amigável: /Pagina -> serve Pagina.html (ignora rotas que comecem com /api)
app.get('/:page', async (req, res, next) => {
  const page = req.params.page;
  if (!page || page.startsWith('api')) return next();
  const filePath = path.join(_dirname, `${page}.html`);
  try {
    await fs.access(filePath);
    return res.sendFile(filePath);
  } catch {
    return next();
  }
});

// ----------- Conexão via Sequelize (MySQL) com fallback para JSON local -----------
let db = null;
const DATA_DIR = path.resolve('.', 'data');
const REVIEWS_FILE = path.join(DATA_DIR, 'reviews.json');
const AGENDAMENTOS_FILE = path.join(DATA_DIR, 'agendamentos.json');


try {
  await sequelize.authenticate();
  await sequelize.sync();
  db = sequelize;
  console.log('Conectado ao banco via Sequelize!');
} catch (err) {
  console.error('Erro ao conectar via Sequelize:', err.message);
  console.log('Usando fallback para armazenamento local (JSON).');
  db = null;
  // garante que diretório e arquivo existam
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });

    console.log('Arquivo de dados local preparado em', REVIEWS_FILE);
  } catch (err2) {
    console.error('Erro ao preparar armazenamento local:', err2.message);
  }
}



// ----------- Rotas API -----------
// Criar usuário (endpoint usado por criandoconta.html)
app.post('/api/usuarios/criar', async (req, res) => {
  try {

    const { nome, telefone, nascimento, senha } = req.body;
    if (!nome || !telefone || !nascimento || !senha) return res.status(400).json({ error: 'Todos os campos são obrigatórios' });
    const hash = await bcrypt.hash(senha, 10);
    if (db) {
      const [result] = await db.execute('INSERT INTO usuarios (name, phone, nascimento, password) VALUES (?, ?, ?, ?)', [nome, telefone, nascimento, hash]);
      return res.json({ message: 'Usuário criado com sucesso!', usuarioId: result.insertId, usuarioNome: nome });
    }
    // Fallback para arquivo JSON
    const fileContent = await fs.readFile(USUARIOS_FILE, 'utf8');
    const arr = JSON.parse(fileContent || '[]');
    const maxId = arr.reduce((m, a) => (a.id && a.id > m ? a.id : m), 0);
    const newItem = {
      id: maxId + 1,
      nome,
      telefone,
      nascimento,
      senha: hash,
      created_at: new Date().toISOString()
    };
    arr.push(newItem);
    await fs.writeFile(USUARIOS_FILE, JSON.stringify(arr, null, 2), 'utf8');
    return res.json({ message: 'Usuário criado (armazenamento local)', usuarioId: newItem.id, usuarioNome: nome });

  } catch (err) {
    console.error('Erro ao criar usuário:', err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Obter dados do usuário por id (usado por perfil.html)
app.get('/api/usuarios/:id', async (req, res) => {
  try {

    const { id } = req.params;
    if (db) {
      const [rows] = await db.execute('SELECT id, name, phone, nascimento FROM usuarios WHERE id = ?', [id]);
      if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
      const u = rows[0];
      return res.json({ usuario: { id: u.id, nome: u.name, telefone: u.phone, nascimento: u.nascimento } });
    }
    // Fallback JSON
    const fileContent = await fs.readFile(USUARIOS_FILE, 'utf8');
    const arr = JSON.parse(fileContent || '[]');
    const u = arr.find(a => String(a.id) === String(id));
    if (!u) return res.status(404).json({ error: 'Usuário não encontrado' });
    return res.json({ usuario: { id: u.id, nome: u.nome, telefone: u.telefone, nascimento: u.nascimento } });

  } catch (err) {
    console.error('Erro ao obter usuário:', err);
    res.status(500).json({ error: 'Erro ao obter dados do usuário' });
  }
});

// Login por nome (endpoint usado por cartaofidelidade.html)
app.post('/api/usuarios/login', async (req, res) => {
  try {
    const { nome, senha } = req.body;
    if (!nome || !senha) return res.status(400).json({ error: 'Nome e senha são obrigatórios' });
    if (db) {
      const [rows] = await db.execute('SELECT id, name, phone, password FROM usuarios WHERE name = ?', [nome]);
      if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado' });
      const user = rows[0];
      const match = await bcrypt.compare(senha, user.password);
      if (!match) return res.status(401).json({ error: 'Senha incorreta' });
      return res.json({ usuario: { id: user.id, nome: user.name, telefone: user.phone } });
    }
    // Fallback JSON
    const fileContent = await fs.readFile(USUARIOS_FILE, 'utf8');
    const arr = JSON.parse(fileContent || '[]');
    const user = arr.find(a => a.nome === nome);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
    const match = await bcrypt.compare(senha, user.senha || user.password || '');
    if (!match) return res.status(401).json({ error: 'Senha incorreta' });
    return res.json({ usuario: { id: user.id, nome: user.nome, telefone: user.telefone } });
  } catch (err) {
    console.error('Erro no login:', err);
    res.status(500).json({ error: 'Erro no login' });
  }
});

// Criar agendamento (vinculado a usuário se fornecido usuario_id)
app.post('/api/agendamentos', async (req, res) => {
  try {
    const { name, age, phone, service, date, time, observacoes, usuario_id } = req.body;
    if (db) {

      let query = 'SELECT * FROM agendamentos';
      let params = [];
      if (usuario_id) {
        query += ' WHERE usuario_id = ?';
        params.push(usuario_id);
      }
      query += ' ORDER BY data_agendamento, hora';
      const [rows] = await db.execute(query, params);

      res.json({ appointments: rows });
    } else {
      const content = await fs.readFile(AGENDAMENTOS_FILE, 'utf8');
      let rows = JSON.parse(content || '[]');
      if (usuario_id) {
        rows = rows.filter(a => String(a.usuario_id) === String(usuario_id));
      }
      // ordenar por data_agendamento e hora
      rows.sort((a, b) => {
        const da = a.data_agendamento ? new Date(a.data_agendamento) : new Date(0);
        const dbt = b.data_agendamento ? new Date(b.data_agendamento) : new Date(0);
        if (da < dbt) return -1;
        if (da > dbt) return 1;
        const ha = a.hora || '';
        const hb = b.hora || '';
        return ha.localeCompare(hb);
      });
      res.json({ appointments: rows });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar agendamentos' });
  }
});

// Excluir agendamento
app.delete('/api/agendamentos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    if (db) {
      await Agendamento.destroy({ where: { id } });
      res.json({ message: 'Agendamento excluído com sucesso' });
    } else {
      const content = await fs.readFile(AGENDAMENTOS_FILE, 'utf8');
      const arr = JSON.parse(content || '[]');
      const newArr = arr.filter(a => String(a.id) !== String(id));
      await fs.writeFile(AGENDAMENTOS_FILE, JSON.stringify(newArr, null, 2), 'utf8');
      res.json({ message: 'Agendamento excluído (armazenamento local)' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao excluir agendamento' });
  }
});

// Reviews
app.get('/api/reviews', async (req, res) => {
  try {
    if (db) {
      const rows = await Review.findAll({ order: [['created_at','DESC']] });
      res.json({ reviews: rows });
    } else {
      // ler do arquivo JSON local
      const content = await fs.readFile(REVIEWS_FILE, 'utf8');
      const rows = JSON.parse(content || '[]');
      // garantir rating em cada registro e ordenar por created_at desc se existir
      for (const r of rows) {
        if (typeof r.rating === 'undefined') r.rating = 0;
      }
      rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      res.json({ reviews: rows });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao listar avaliações' });
  }
});

app.post('/api/reviews', async (req, res) => {
  try {
    const { author_name, content, rating } = req.body;
    const rValue = Number.isFinite ? (Number(rating) || 0) : (rating || 0);
    if (db) {
      await Review.create({ author_name: author_name || 'Anônimo', content, rating: Number(rValue) || 0 });
      res.json({ message: 'Avaliação enviada com sucesso' });
    } else {
      // salvar no arquivo JSON local
      const fileContent = await fs.readFile(REVIEWS_FILE, 'utf8');
      const arr = JSON.parse(fileContent || '[]');
      const maxId = arr.reduce((m, r) => (r.id && r.id > m ? r.id : m), 0);
      const newReview = {
        id: maxId + 1,
        author_name: author_name || 'Anônimo',
        content,
        rating: Number(rating) || 0,
        created_at: new Date().toISOString()
      };
      arr.push(newReview);
      await fs.writeFile(REVIEWS_FILE, JSON.stringify(arr, null, 2), 'utf8');
      res.json({ message: 'Avaliação enviada com sucesso (armazenamento local)' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao enviar avaliação' });
  }
});

// Fidelidade - cancelar cartão
app.post('/api/fidelities/:userId/cancel', async (req, res) => {
  try {
    const { userId } = req.params;
    if (db) {
      await Fidelidade.update({ status: 'cancelado' }, { where: { usuario_id: userId } });
      res.json({ message: 'Cartão fidelidade cancelado' });
    } else {
      res.status(500).json({ error: 'Banco não disponível - operação não permitida' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao cancelar cartão' });
  }
});

// Adicionar pontos ao cartão de fidelidade (por userId ou email)
app.post('/api/fidelities/adjust', async (req, res) => {
  try {
    const { usuario_id, email, points } = req.body;
    const pts = Number(points) || 0;
    if (!usuario_id && !email) return res.status(400).json({ error: 'usuario_id ou email requerido' });

    let uid = usuario_id;

    // se email informado, tentar resolver para usuario_id (DB ou local)
    if (!uid && email) {
      if (db) {
        const user = await Usuario.findOne({ where: { email } });
        if (user) uid = user.id;
      }
      if (!uid) {
        // tentar local users.json
        try {
          const content = await fs.readFile(USERS_FILE, 'utf8');
          const arr = JSON.parse(content || '[]');
          const u = arr.find(x => String(x.email) === String(email));
          if (u) uid = u.id;
        } catch (e) {
          // ignore
        }
      }
    }

    if (!uid) return res.status(404).json({ error: 'Usuário não encontrado para ajuste de pontos' });

    // Para evitar problemas com constraints no DB, usamos sempre o fallback local para gravação de pontos.
    const FID_FILE = path.join(DATA_DIR, 'fidelidades.json');
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      let content = '[]';
      try { content = await fs.readFile(FID_FILE, 'utf8'); } catch {}
      const arr = JSON.parse(content || '[]');
      let f = arr.find(x => String(x.usuario_id) === String(uid));
      if (!f) {
        f = { id: (arr.reduce((m,a)=> a.id && a.id>m? a.id:m,0))+1, usuario_id: uid, pontos: pts, status: 'ativo' };
        arr.push(f);
      } else {
        f.pontos = (f.pontos||0) + pts;
      }
      await fs.writeFile(FID_FILE, JSON.stringify(arr,null,2),'utf8');
      return res.json({ message: 'Pontos ajustados (local)', usuario_id: uid, pontos: f.pontos });
    } catch (errF) {
      console.error('Erro ao ajustar pontos localmente:', errF.message);
      return res.status(500).json({ error: 'Erro ao ajustar pontos' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao ajustar pontos' });
  }
});

// ----------- Servir frontend -----------
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: '.' });
});

// ----------- Iniciar servidor -----------
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}/`);
});
