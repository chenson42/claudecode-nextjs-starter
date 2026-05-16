import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";

export const authConfig: NextAuthConfig = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt" },
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID,
      clientSecret: process.env.AUTH_GOOGLE_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  pages: { signIn: "/signin" },
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
};
