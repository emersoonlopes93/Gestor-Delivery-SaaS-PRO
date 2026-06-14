# Guia de Temas (Light / Dark) e Tokens de Design

Este guia descreve o sistema de temas do **Gestor Delivery SaaS PRO** e define regras estritas para o uso de tokens e cores de design em toda a aplicação.

---

## 🚀 Princípios Gerais

1. **NUNCA use cores Tailwind concretas** (ex: `bg-white`, `bg-gray-900`, `text-gray-900`, `border-gray-100`) para superfícies, textos e bordas comuns.
2. **Sempre utilize os tokens semânticos** mapeados como variáveis CSS que se adaptam automaticamente a cada tema.
3. **Mantenha o contraste WCAG 2.1 AA** de no mínimo **4.5:1** para textos comuns e **3.0:1** para componentes de UI interativos e textos grandes.

---

## 🎨 Tabela de Tokens Semânticos Principais

| Token Tailwind | Variável CSS | Propósito | Exemplo de Uso |
|----------------|--------------|-----------|----------------|
| `bg-background` | `--background` | Fundo principal da página | Container externo de uma página |
| `bg-card` | `--card` | Fundo de cartões, modais e painéis | `<div className="bg-card">` |
| `text-foreground` | `--foreground` | Texto principal de alta legibilidade | Títulos e parágrafos normais |
| `text-muted-foreground` | `--muted-foreground` | Texto de apoio com menor contraste | Legendas, datas, descrições secundárias |
| `bg-muted` | `--muted` | Fundo sutil de destaque ou controles | Inputs desabilitados, tabs inativas |
| `border-border` | `--border` | Cor padrão de bordas e divisórias | Divisórias `<hr />`, bordas de tabelas |
| `border-input` | `--input` | Cor padrão de borda para inputs | Inputs do usuário |
| `bg-input-bg` | `--input-bg` | Cor de fundo de inputs | Inputs do usuário |
| `bg-primary` | `--primary` | Cor do botão ou link primário de ação | Botões de submit ou links principais |
| `text-primary-foreground` | `--primary-foreground` | Cor de texto legível sobre cor primária | Texto dentro de botões primários |

---

## 🛠️ Padrões de Implementação Corretos vs. Incorretos

### ❌ Incorreto (Quebra com temas)
```tsx
// Quebra no dark mode ou em fundos dinâmicos
<div className="bg-white border border-gray-100 p-6 rounded-2xl">
  <h3 className="text-gray-900 font-bold">Título do Card</h3>
  <p className="text-gray-500">Descrição aqui...</p>
</div>
```

### ✅ Correto (Semântico e responsivo ao tema)
```tsx
// Adapta-se perfeitamente aos temas light e dark
<div className="bg-card border border-border p-6 rounded-2xl">
  <h3 className="text-foreground font-bold">Título do Card</h3>
  <p className="text-muted-foreground">Descrição aqui...</p>
</div>
```

---

## ⚠️ Detecção e Correção de Problemas Comuns

### 1. Inputs com Autocomplemento (Autofill) do Navegador
O Chrome força um fundo branco e texto preto em inputs autocompletados. Para evitar isso e manter a conformidade com o tema dark, todos os inputs do projeto possuem estilos globais aplicados. Se criar inputs nativos sem classes, certifique-se de que herdem o estilo:
```css
input:-webkit-autofill {
  -webkit-box-shadow: 0 0 0 30px var(--card) inset !important;
  -webkit-text-fill-color: var(--foreground) !important;
}
```

### 2. Imagens e Códigos QR
Alguns elementos de imagem ou QR codes precisam obrigatoriamente de um fundo contrastante e estável (geralmente branco puro) para funcionarem ou serem escaneados.
* Nestes casos excepcionais, use a classe `bg-white` de forma explícita e adicione uma borda sutil com `border border-border/20` para não parecer "solto" no dark mode.
