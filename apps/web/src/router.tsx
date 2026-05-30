import type { AppRouter } from "@DCRM/api/routers/index";
import { QueryCache, QueryClient } from "@tanstack/react-query";
import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { createIsomorphicFn } from "@tanstack/react-start";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import { toast } from "sonner";

import Loader from "./components/loader";
import { routeTree } from "./routeTree.gen";
import { TRPCProvider } from "./utils/trpc";

const getIncomingAuthHeaders = createIsomorphicFn()
  .client(() => null)
  .server(async () => {
    const { getRequest } = await import("@tanstack/react-start/server");
    const requestHeaders = getRequest().headers;

    return {
      authorization: requestHeaders.get("authorization"),
      cookie: requestHeaders.get("cookie"),
    };
  });

function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error, query) => {
        toast.error(error.message, {
          action: {
            label: "retry",
            onClick: query.invalidate,
          },
        });
      },
    }),
    defaultOptions: { queries: { staleTime: 60 * 1000 } },
  });
}

function createTrpcClient() {
  return createTRPCClient<AppRouter>({
    links: [
      httpBatchLink({
        url: "/api/trpc",
        async fetch(url, options) {
          return fetch(url, {
            ...options,
            credentials: "include",
            headers: await mergeAuthHeaders(options?.headers),
          });
        },
      }),
    ],
  });
}

async function mergeAuthHeaders(headers: HeadersInit | undefined): Promise<Headers> {
  const nextHeaders = new Headers(headers);
  const incomingAuthHeaders = await getIncomingAuthHeaders();

  if (incomingAuthHeaders?.cookie) {
    nextHeaders.set("cookie", incomingAuthHeaders.cookie);
  }

  if (incomingAuthHeaders?.authorization) {
    nextHeaders.set("authorization", incomingAuthHeaders.authorization);
  }

  return nextHeaders;
}

export const getRouter = () => {
  const queryClient = createQueryClient();
  const trpcClient = createTrpcClient();
  const trpc = createTRPCOptionsProxy({
    client: trpcClient,
    queryClient,
  });

  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: { trpc, queryClient },
    defaultPendingComponent: () => <Loader />,
    defaultNotFoundComponent: () => <div>Not Found</div>,
    Wrap: ({ children }) => (
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    ),
  });

  setupRouterSsrQueryIntegration({
    router,
    queryClient,
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
