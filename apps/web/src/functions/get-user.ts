import { createServerFn } from "@tanstack/react-start";

import { authMiddleware } from "@/middleware/auth";

type GuardSession = {
  session: {
    expiresAt: Date;
    id: string;
  };
  user: {
    email: string;
    id: string;
    image?: string | null;
    name: string;
  };
};

export const getUser = createServerFn({ method: "GET" })
  .middleware([authMiddleware])
  .handler(async ({ context }): Promise<GuardSession | null> => {
    const rawSession = context.session;

    if (!rawSession) {
      return null;
    }

    return {
      session: {
        expiresAt: rawSession.session.expiresAt,
        id: rawSession.session.id,
      },
      user: {
        email: rawSession.user.email,
        id: rawSession.user.id,
        image: rawSession.user.image,
        name: rawSession.user.name,
      },
    };
  });
