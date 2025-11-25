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

// Servir corretamente os arquivos estáticos da pasta "publico"
app.use(express.static(path.join(_dirname, 'index')));

// Página inicial
app.get('/', (req, res) => {
  res.sendFile(path.join(_dirname, 'publico', 'index.html'));
});


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
const USERS_FILE = path.join(DATA_DIR, 'users.json');

try {
  await sequelize.authenticate();
  // sincroniza modelos com o banco (aplica alterações necessárias nas tabelas existentes)
  await sequelize.sync({ alter: true });
  db = sequelize;
  console.log('Conectado ao banco via Sequelize! (sync alter aplicado)');
} catch (err) {
  console.error('Erro ao conectar via Sequelize:', err.message);
  console.log('Usando fallback para armazenamento local (JSON).');
  db = null;
  // garante que diretório e arquivo existam
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    try { await fs.access(REVIEWS_FILE); } catch { await fs.writeFile(REVIEWS_FILE, '[]', 'utf8'); }
    try { await fs.access(AGENDAMENTOS_FILE); } catch { await fs.writeFile(AGENDAMENTOS_FILE, '[]', 'utf8'); }
    try { await fs.access(USERS_FILE); } catch { await fs.writeFile(USERS_FILE, '[]', 'utf8'); }
    console.log('Arquivos de dados locais preparados em', DATA_DIR);
  } catch (err2) {
    console.error('Erro ao preparar armazenamento local:', err2.message);
  }
}

// ----------- Rotas API -----------

// Signup (criando conta)
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Nome, email e senha são obrigatórios' });
    
    const hash = await bcrypt.hash(password, 10);
    
    if (db) {
      try {
        const user = await Usuario.create({ name, email, password: hash, phone });
        return res.json({ message: 'Usuário criado com sucesso!', userId: user.id });
      } catch (errCreate) {
        console.error('Erro ao salvar via Sequelize, usando fallback JSON:', errCreate.message);
      }
    }
    
    // fallback local
    try {
      await fs.mkdir(DATA_DIR, { recursive: true });
      let content = '[]';
      try { content = await fs.readFile(USERS_FILE, 'utf8'); } catch {}
      const arr = JSON.parse(content || '[]');
      const maxId = arr.reduce((m, u) => (u.id && u.id > m ? u.id : m), 0);
      const newUser = { id: maxId + 1, name, email, password: hash, phone };
      arr.push(newUser);
      await fs.writeFile(USERS_FILE, JSON.stringify(arr, null, 2), 'utf8');
      return res.json({ message: 'Usuário criado (armazenamento local)', userId: newUser.id });
    } catch (errLocal) {
      console.error('Erro no fallback de signup:', errLocal.message);
      return res.status(500).json({ error: 'Erro ao criar usuário' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar usuário' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: 'Email e senha são obrigatórios' });
    
    // tentar DB via Sequelize primeiro
    if (db) {
      try {
        const user = await Usuario.findOne({ where: { email } });
        if (user) {
          const match = await bcrypt.compare(senha, user.password);
          if (!match) return res.status(401).json({ error: 'Senha incorreta' });
          return res.json({ message: 'Login realizado com sucesso', userId: user.id });
        }
      } catch (errDb) {
        console.error('Erro ao consultar DB no login, usando fallback JSON se disponível:', errDb.message);
      }
    }
    
    // fallback local
    try {
      let content = '[]';
      try { content = await fs.readFile(USERS_FILE, 'utf8'); } catch {}
      const arr = JSON.parse(content || '[]');
      const user = arr.find(u => String(u.email) === String(email));
      if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
      const match = await bcrypt.compare(senha, user.password);
      if (!match) return res.status(401).json({ error: 'Senha incorreta' });
      return res.json({ message: 'Login realizado (local)', userId: user.id });
    } catch (errLocal) {
      console.error('Erro no fallback de login:', errLocal.message);
      return res.status(500).json({ error: 'Erro no login' });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro no login' });
  }
});

// Criar agendamento
app.post('/api/agendamentos', async (req, res) => {
  try {
    const { name, age, phone, service, date, time, observacoes } = req.body;
    if (db) {
      await Agendamento.create({ name, age: age || null, phone: phone || '', service: service || '', data_agendamento: date || null, hora: time || null, observacoes: observacoes || null });
      res.json({ message: 'Agendamento criado com sucesso' });
    } else {
      // fallback para arquivo JSON
      const fileContent = await fs.readFile(AGENDAMENTOS_FILE, 'utf8');
      const arr = JSON.parse(fileContent || '[]');
      const maxId = arr.reduce((m, a) => (a.id && a.id > m ? a.id : m), 0);
      const newItem = {
        id: maxId + 1,
        name,
        age: age || null,
        phone: phone || '',
        service: service || '',
        data_agendamento: date || null,
        hora: time || null,
        observacoes: observacoes || null
      };
      arr.push(newItem);
      await fs.writeFile(AGENDAMENTOS_FILE, JSON.stringify(arr, null, 2), 'utf8');
      res.json({ message: 'Agendamento criado (armazenamento local)' });
    }
  } catch (err) {
    console.error('Erro ao criar agendamento:', err);
    res.status(500).json({ error: 'Erro ao criar agendamento' });
  }
});

// Listar agendamentos
app.get('/api/agendamentos', async (req, res) => {
  try {
    if (db) {
      const rows = await Agendamento.findAll({ order: [['data_agendamento','ASC'], ['hora','ASC']] });
      res.json({ appointments: rows });
    } else {
      const content = await fs.readFile(AGENDAMENTOS_FILE, 'utf8');
      const rows = JSON.parse(content || '[]');
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
      const content = await fs.readFile(REVIEWS_FILE, 'utf8');
      const rows = JSON.parse(content || '[]');
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

// Adicionar pontos ao cartão de fidelidade
app.post('/api/fidelities/adjust', async (req, res) => {
  try {
    const { usuario_id, email, points } = req.body;
    const pts = Number(points) || 0;
    if (!usuario_id && !email) return res.status(400).json({ error: 'usuario_id ou email requerido' });

    let uid = usuario_id;

    if (!uid && email) {
      if (db) {
        const user = await Usuario.findOne({ where: { email } });
        if (user) uid = user.id;
      }
      if (!uid) {
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

// Servir frontend
app.get('/', (req, res) => {
  res.sendFile('index.html', { root: '.' });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}/`);
});
