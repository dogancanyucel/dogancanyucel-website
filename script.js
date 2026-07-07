/* ══ script.js ══ */

// ── Navbar scroll effect ──────────────────
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 30) {
    navbar.classList.add('scrolled');
  } else {
    navbar.classList.remove('scrolled');
  }
});

// ── Mobile hamburger menu ─────────────────
const hamburger    = document.getElementById('hamburger');
const mobileMenu   = document.getElementById('mobileMenu');
const mobileLinks  = document.querySelectorAll('.mobile-link');

hamburger.addEventListener('click', () => {
  mobileMenu.classList.toggle('open');
});

mobileLinks.forEach(link => {
  link.addEventListener('click', () => {
    mobileMenu.classList.remove('open');
  });
});

// ── Particle Canvas ───────────────────────
const canvas = document.getElementById('particles-canvas');
const ctx    = canvas.getContext('2d');

let particles = [];
const PARTICLE_COUNT = 80;
const TQ_COLOR = '0, 188, 212';

function resizeCanvas() {
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

class Particle {
  constructor() {
    this.reset();
  }
  reset() {
    this.x  = Math.random() * canvas.width;
    this.y  = Math.random() * canvas.height;
    this.vx = (Math.random() - 0.5) * 0.4;
    this.vy = (Math.random() - 0.5) * 0.4;
    this.r  = Math.random() * 1.8 + 0.5;
    this.alpha = Math.random() * 0.5 + 0.15;
    this.life  = Math.random() * 200 + 100;
    this.age   = 0;
  }
  update() {
    this.x   += this.vx;
    this.y   += this.vy;
    this.age += 1;
    if (this.age > this.life || this.x < 0 || this.x > canvas.width || this.y < 0 || this.y > canvas.height) {
      this.reset();
    }
  }
  draw() {
    const fade = Math.min(this.age / 30, 1) * Math.min((this.life - this.age) / 30, 1);
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${TQ_COLOR}, ${this.alpha * fade})`;
    ctx.fill();
  }
}

function initParticles() {
  particles = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const p = new Particle();
    p.age = Math.random() * p.life; // stagger start
    particles.push(p);
  }
}
initParticles();

function drawConnections() {
  const CONNECT_DIST = 120;
  for (let i = 0; i < particles.length; i++) {
    for (let j = i + 1; j < particles.length; j++) {
      const dx = particles[i].x - particles[j].x;
      const dy = particles[i].y - particles[j].y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < CONNECT_DIST) {
        const alpha = (1 - dist / CONNECT_DIST) * 0.15;
        ctx.beginPath();
        ctx.moveTo(particles[i].x, particles[i].y);
        ctx.lineTo(particles[j].x, particles[j].y);
        ctx.strokeStyle = `rgba(${TQ_COLOR}, ${alpha})`;
        ctx.lineWidth = 0.6;
        ctx.stroke();
      }
    }
  }
}

function animateParticles() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  particles.forEach(p => { p.update(); p.draw(); });
  drawConnections();
  requestAnimationFrame(animateParticles);
}
animateParticles();

// ── Skill bar animation (IntersectionObserver) ─
const skillFills = document.querySelectorAll('.skill-fill');

const skillObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const el    = entry.target;
      const level = el.getAttribute('data-level');
      el.style.width = level + '%';
      skillObserver.unobserve(el);
    }
  });
}, { threshold: 0.3 });

skillFills.forEach(el => skillObserver.observe(el));

// ── Fade-in-up on scroll ──────────────────
const fadeEls = document.querySelectorAll(
  '.about-text, .about-card, .project-card, .skill-group, .contact-card, .contact-form-wrap, .stat'
);
fadeEls.forEach(el => el.classList.add('fade-in-up'));

const fadeObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, idx) => {
    if (entry.isIntersecting) {
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, idx * 60);
      fadeObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

fadeEls.forEach(el => fadeObserver.observe(el));

// ── Contact form submission (Formspree) ───
const form       = document.getElementById('contactForm');
const submitBtn  = document.getElementById('submitBtn');
const submitText = document.getElementById('submitText');
const formNote   = document.getElementById('formNote');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const actionUrl = form.getAttribute('action');
  if (actionUrl.includes('YOUR_FORM_ID')) {
    formNote.textContent = '⚙️ Form not configured yet — reach me on LinkedIn or GitHub directly!';
    formNote.style.color = '#ffb300';
    return;
  }

  submitBtn.disabled = true;
  submitText.textContent = 'Sending…';

  try {
    const data = new FormData(form);
    const response = await fetch(actionUrl, {
      method: 'POST',
      body: data,
      headers: { 'Accept': 'application/json' }
    });

    if (response.ok) {
      formNote.textContent = '✅ Message sent! I\'ll get back to you soon.';
      formNote.style.color = '#00bcd4';
      form.reset();
    } else {
      throw new Error('Server error');
    }
  } catch {
    formNote.textContent = '❌ Something went wrong. Try reaching me on LinkedIn.';
    formNote.style.color = '#ff5252';
  } finally {
    submitBtn.disabled = false;
    submitText.textContent = 'Send Message 🚀';
  }
});

// ── Active nav link highlight ─────────────
const sections = document.querySelectorAll('section[id]');
const navLinksAll = document.querySelectorAll('.nav-links a');

const sectionObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      navLinksAll.forEach(a => a.style.color = '');
      const activeLink = document.querySelector(`.nav-links a[href="#${entry.target.id}"]`);
      if (activeLink) activeLink.style.color = 'var(--tq)';
    }
  });
}, { threshold: 0.4 });

sections.forEach(s => sectionObserver.observe(s));
