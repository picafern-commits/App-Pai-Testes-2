# Brinka PRO

App de fecho de caixa para iPhone via GitHub Pages.

## Ficheiros
- `index.html`
- `style.css`
- `app.js`
- `firebase-config.js`
- `manifest.json`

## Como usar
1. Envia estes ficheiros para um repositório GitHub.
2. Vai a Settings > Pages.
3. Escolhe a branch `main` e a pasta `/root`.
4. Abre o link no Safari do iPhone.
5. Carrega em Partilhar > Adicionar ao ecrã principal.

## Firebase
A app funciona logo em modo localStorage.
Para sincronizar entre dispositivos:
1. Cria um projeto Firebase.
2. Ativa Firestore Database.
3. Copia a configuração web para `firebase-config.js`.
4. Muda `window.BRINKA_FIREBASE_ENABLED = true;`.

## Regras Firestore temporárias para testes
Usa só para testar:

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
