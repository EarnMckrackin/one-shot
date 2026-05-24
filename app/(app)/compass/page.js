import { redirect } from "next/navigation";

export const metadata = { title: "Resurface - One Shot" };

export default function CompassPage() {
  redirect("/resurface");
}
