import { ProfileForms } from "@/features/profile/components/ProfileForms";

export function StaffProfilePage() {
  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-semibold">My profile</h1>
      <ProfileForms />
    </div>
  );
}
