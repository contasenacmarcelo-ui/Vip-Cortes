// main.js - frontend completo VipCortes
const API_BASE = window.API_BASE_URL ? window.API_BASE_URL.replace(/\/$/, '') + '/api' : window.location.origin + '/api';

async function apiRequest(path, opts = {}) {
  const res = await fetch(API_BASE + path, opts);
  const json = await res.text().then(t => { try { return t ? JSON.parse(t) : {}; } catch { return {}; } });
  if (!res.ok) throw new Error(json.error || json.message || `Erro ${res.status}`);
  return json;
}

function escapeHtml(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]);
}

// ------------------ AGENDAMENTO ------------------
(function setupAgendar() {
  const form = document.querySelector('form#agendar') || document.querySelector('form');
  if (!form) return;

  const nomeEl = document.getElementById('nome');
  const idadeEl = document.getElementById('idade');
  const foneEl = document.getElementById('fone');
  const servicosEl = document.getElementById('servicos');
  const diaEl = document.getElementById('dia');
  const horarioEl = document.getElementById('horario');

  form.addEventListener('submit', async e => {
    e.preventDefault();

    const payload = {
      name: nomeEl.value.trim(),
      age: idadeEl ? Number(idadeEl.value) : null,
      phone: foneEl ? foneEl.value.trim() : '',
      service: servicosEl.value,
      date: diaEl.value,
      time: horarioEl.value,
      observacoes: null
    };

    if (!payload.name || !payload.service || !payload.date) {
      return alert('Preencha Nome, Serviço e Data');
    }

    try {
      await apiRequest('/agendamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      window.location.href = 'AGENDAR2.html';
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar agendamento: ' + err.message);
    }
  });

})();

// ------------------ ADMINISTRAÇÃO ------------------
(function setupAdmin() {
  // só executa se estiver na admin.html
  if (!window.location.pathname.toLowerCase().includes('admin.html')) return;

  const tabela = document.querySelector('.agenda tbody');
  if (!tabela) return;

  async function carregarAgendamentos() {
    try {
      const { appointments } = await apiRequest('/agendamentos');
      tabela.innerHTML = '';

      if (!appointments.length) {
        tabela.innerHTML = `<tr><td colspan="6" style="text-align:center;">Nenhum agendamento encontrado.</td></tr>`;
        return;
      }

      for (const ag of appointments) {
        const tr = document.createElement('tr');

        tr.innerHTML = `
          <td>${escapeHtml(ag.name)}</td>
          <td>${escapeHtml(ag.phone)}</td>
          <td>${escapeHtml(ag.service)}</td>
          <td>${new Date(ag.data_agendamento).toLocaleDateString('pt-BR')}</td>
          <td>${ag.hora ? ag.hora.substring(0, 5) : ''}</td>
          <td><button class="btn-excluir" data-id="${ag.id}">Excluir</button></td>
        `;

        tabela.appendChild(tr);
      }

      // adiciona evento nos botões de exclusão
      document.querySelectorAll('.btn-excluir').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.id;
          if (!confirm('Deseja realmente excluir este agendamento?')) return;

          try {
            await apiRequest(`/agendamentos/${id}`, { method: 'DELETE' });
            alert('Agendamento excluído com sucesso!');
            await carregarAgendamentos(); // recarrega a lista
          } catch (err) {
            console.error(err);
            alert('Erro ao excluir: ' + err.message);
          }
        });
      });
    } catch (err) {
      console.error('Erro ao carregar agendamentos:', err);
      tabela.innerHTML = `<tr><td colspan="6" style="text-align:center;color:red;">Erro ao carregar agendamentos</td></tr>`;
    }
  }

  carregarAgendamentos();
})();

// ------------------ AVALIAÇÕES ------------------
(function setupAvaliacoes() {
  // só executa se estiver na Avaliações.html
  if (!window.location.pathname.toLowerCase().includes('avaliações.html')) return;

  const container = document.querySelector('.containerava');
  if (!container) return;

  async function carregarAvaliacoes() {
    try {
      const { reviews } = await apiRequest('/reviews');
      container.innerHTML = '';

      if (!reviews.length) {
        container.innerHTML = `<div style="text-align:center; font-size:18px; color:#555;">Nenhuma avaliação cadastrada ainda.</div>`;
        return;
      }

      for (const review of reviews) {
        const div = document.createElement('div');
        div.className = 'coluns';

        div.innerHTML = `
          <div class="pefilava">
            <img src="assets/perfil.png" alt="" class="perfilava-foto">
            <span class="nome">${escapeHtml(review.author_name || 'Anônimo')}</span>
          </div>
          <div class="avali">
            <span>${escapeHtml(review.content)}</span>
          </div>
        `;

        container.appendChild(div);
      }
    } catch (err) {
      console.error('Erro ao carregar avaliações:', err);
      container.innerHTML = `<div style="text-align:center; color:red;">Erro ao carregar avaliações</div>`;
    }
  }

  carregarAvaliacoes();
})();

// ------------------ ENVIAR AVALIAÇÃO ------------------
(function setupEnviarAvaliacao() {
  // só executa se estiver na avalienos.html
  if (!window.location.pathname.toLowerCase().includes('avalienos.html')) return;

  const stars = document.querySelectorAll('.star');
  const textarea = document.querySelector('.digiteaqui');
  const enviarBtn = document.querySelector('.enviar');

  let selectedRating = 0;

  // funcionalidade das estrelas
  stars.forEach((star, index) => {
    star.addEventListener('click', () => {
      selectedRating = index + 1;
      stars.forEach((s, i) => {
        s.classList.toggle('active', i < selectedRating);
      });
    });
  });

  // envio da avaliação
  enviarBtn.addEventListener('click', async (e) => {
    e.preventDefault();

    const content = textarea.value.trim();
    if (!content) {
      alert('Por favor, escreva sua avaliação.');
      return;
    }

    const payload = {
      author_name: 'Usuário', // pode ser ajustado para nome real se houver login
      content: content
    };

    try {
      await apiRequest('/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      alert('Avaliação enviada com sucesso!');
      textarea.value = '';
      stars.forEach(s => s.classList.remove('active'));
      selectedRating = 0;
      // redirecionar para Avaliações.html
      window.location.href = 'Avaliações.html';
    } catch (err) {
      console.error(err);
      alert('Erro ao enviar avaliação: ' + err.message);
    }
  });
})();

const stars = document.querySelectorAll('.star');
let lastClickedIndex = 0; // guarda qual estrela foi clicada por último
 
stars.forEach(star => {
  star.addEventListener('click', () => {
    const index = parseInt(star.getAttribute('data-index'));
   
    if (lastClickedIndex === index) {
      // Se clicar duas vezes na mesma estrela, desmarca todas
      stars.forEach(s => s.classList.remove('active'));
      lastClickedIndex = 0; // resetar o índice
    } else {
      // Marca até a estrela clicada
      stars.forEach(s => s.classList.remove('active'));
      for(let i = 0; i < index; i++) {
        stars[i].classList.add('active');
      }
      lastClickedIndex = index; // atualiza o índice da última estrela clicada
    }
  });
});