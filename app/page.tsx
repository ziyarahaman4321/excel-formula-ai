import { proEnabled } from "@/lib/license";
import { envInt } from "@/lib/usage";
import Tool from "./tool";

export default function Home() {
  const checkoutUrl = process.env.CHECKOUT_URL || "";

  return (
    <Tool
      freeLimit={envInt("FREE_DAILY_LIMIT", 5)}
      proLimit={envInt("PRO_DAILY_LIMIT", 200)}
      proPrice={process.env.PRO_PRICE || "$5 / month"}
      // A checkout link is only useful once keys can be verified.
      checkoutUrl={proEnabled() ? checkoutUrl : ""}
      licensesEnabled={proEnabled()}
    />
  );
}
