import "server-only";

import "@/aura/server/auth/operations";
import "@/features/notifications/server/whatsapp";
import "@/features/notifications/server/operations";
import "@/features/referral/server/notifications";
import "@/features/admin/index";
import "@/features/catalog/index";
import "@/features/payments/index";
import "@/features/requests/index";
import "@/features/tracking/index";
import "@/features/reviews/index";
import "@/features/blog/index";
import "@/features/user/index";
import "@/features/referral/index";

export {
  getClientOperationManifest,
  getOperation,
  listOperations,
} from "@/aura/server/registry";
