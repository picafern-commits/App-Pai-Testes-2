# Brinka Web PC + iPhone

Versão profissional para usar no PC via web e também no iPhone pelo Safari.

## O que inclui
- Dashboard profissional
- Fecho de caixa com notas e moedas
- Valor esperado vs contado
- Histórico com pesquisa e filtros
- Relatórios
- Exportar CSV
- Configurações
- Logo incluído
- Firebase opcional
- GitHub Pages ready

## Como publicar no GitHub Pages
1. Cria um repositório no GitHub.
2. Envia todos estes ficheiros para a raiz do repositório.
3. Vai a Settings > Pages.
4. Em Source escolhe `Deploy from a branch`.
5. Escolhe branch `main` e pasta `/root`.
6. Guarda.
7. Abre o link no PC ou Safari do iPhone.

## Firebase
A app funciona sem Firebase em modo local.
Para sincronizar PC/iPhone:
- abre `firebase-config.js`
- cola a configuração do Firebase
- muda `window.BRINKA_FIREBASE_ENABLED = true;`

## Regras temporárias para testar Firestore
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /brinka_fechos/{doc} {
      allow read, write: if true;
    }
  }
}
```
