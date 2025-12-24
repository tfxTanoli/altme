import { RequestForm } from "@/components/requests/request-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function NewRequestPage() {
  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="mx-auto grid w-full max-w-2xl items-start gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Create a New Request</CardTitle>
            <CardDescription>
              Fill out the details below to find the perfect photographer for your project.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestForm />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
