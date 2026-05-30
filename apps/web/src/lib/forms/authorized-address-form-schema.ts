import { z } from "zod";

import type { FormedibleFieldConfig } from "@DCRM/ui/components/formedible/lib/types";

const authorizedAddressFormSchema = z.object({
  patterns: z.string().min(1, "Enter at least one email or pattern"),
});

type AuthorizedAddressFormValues = z.infer<typeof authorizedAddressFormSchema>;

const authorizedAddressFormFields: readonly FormedibleFieldConfig<AuthorizedAddressFormValues>[] = [
  {
    name: "patterns",
    type: "textarea",
    label: "Authorized Addresses",
    placeholder: "user@example.com\n*@company.com",
    required: true,
    description: "One per line. Use exact email addresses or *@domain.com for wildcard domain matching.",
    textareaConfig: {
      rows: 4,
    },
  },
];

const authorizedAddressFormDefaultValues: AuthorizedAddressFormValues = {
  patterns: "",
};

export {
  authorizedAddressFormSchema,
  authorizedAddressFormFields,
  authorizedAddressFormDefaultValues,
};
export type { AuthorizedAddressFormValues };
