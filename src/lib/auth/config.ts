// TODO: Installer NextAuth v5 : npm install next-auth@beta
// TODO: Ajouter AUTH_SECRET dans .env.local (générer avec : openssl rand -base64 32)
// TODO: Configurer un provider (Credentials, Google, etc.)
// TODO: Créer src/app/api/auth/[...nextauth]/route.ts

// export const authConfig = {
//   providers: [
//     Credentials({
//       async authorize(credentials) {
//         // Vérifier email + mot de passe en base
//       },
//     }),
//   ],
//   pages: { signIn: '/admin/login' },
//   callbacks: {
//     authorized({ auth, request }) {
//       return !!auth?.user
//     },
//   },
// } satisfies NextAuthConfig

export const authConfig = null // TODO: remplacer par la config NextAuth
