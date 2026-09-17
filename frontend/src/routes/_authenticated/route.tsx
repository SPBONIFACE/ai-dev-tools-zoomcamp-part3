import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { api } from "@/lib/api";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    if (!api.auth.isAuthenticated()) {
      throw redirect({ to: "/auth" });
    }
    try {
      const user = await api.auth.me();
      return { user };
    } catch {
      api.auth.clearToken();
      throw redirect({ to: "/auth" });
    }
  },
  component: () => <Outlet />,
});
