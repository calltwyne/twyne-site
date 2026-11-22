import { createNodeProtectedResourceFetch } from "@webstudio-is/sdk/protected-resource-fetch-node";
export const createManagedFormEmailSender = (_input: { context: unknown; formData: FormData; projectId: string }) => undefined;
export const validateManagedFormEmail = (_request: unknown, _formData: FormData) => undefined;
export const createManagedFormResourceFetch = ({ request, context, projectDomain }: { request: Request; context: unknown; projectDomain?: string }) => {
  void context;
  return createNodeProtectedResourceFetch({
    projectId: "371dd6c6-fdc2-4b70-8c58-5536eddf106e",
    matchSubdomains: false,
    deniedHostnames: [
      new URL(request.url).hostname,
      projectDomain,
      ...[],
    ].filter((hostname): hostname is string => hostname !== undefined),
  });
};
