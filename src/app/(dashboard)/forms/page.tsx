import { pageViewer } from "@/lib/auth/session";
import { FormsView } from "./_components/FormsView";

export default async function FormsPage() {
  await pageViewer("forms");
  return <FormsView />;
}
