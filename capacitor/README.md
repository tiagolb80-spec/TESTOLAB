# TestoLab – App Android (Capacitor)

Versão nativa do TestoLab com interface mais profissional.

## Como gerar o APK

### Requisitos
- Node.js 18+
- Android Studio

### Passos

```bash
cd capacitor
npm install
npx cap add android
npx cap sync
npx cap open android
```

No Android Studio:
1. Aguarde o Gradle
2. **Build → Build APK(s)**
3. O APK fica em `android/app/build/outputs/apk/debug/`

## Interface

- Navegação inferior (padrão de app)
- Cards modernos e tipografia limpa
- Projeção em ng/dL com calibração automática
- Interpretação de exames com contexto de data
