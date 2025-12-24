
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const TermsOfServicePage: React.FC = () => {
  return (
      <main className="flex-1 bg-muted/40 p-4 md:p-8 lg:p-12">
        <div className="mx-auto max-w-4xl">
            <Card>
                <CardHeader className="text-center">
                    <CardTitle className="text-3xl font-bold tracking-tight sm:text-4xl">Terms of Service</CardTitle>
                    <CardDescription className="mt-4 text-lg">
                        Last updated: November 27, 2025
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="prose prose-lg mx-auto max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-primary">
                        <p>
                        Welcome to AltMe! These Terms of Service ("Terms") govern your use of the AltMe website and services (the "Platform"). By using our Platform, you agree to these Terms.
                        </p>
                        
                        <h2>1. Accounts</h2>
                        <p>
                        When you create an account with us, you must provide information that is accurate, complete, and current at all times. Failure to do so constitutes a breach of the Terms, which may result in immediate termination of your account on our Platform.
                        </p>

                        <h2>2. Intellectual Property and Content</h2>
                        <p>
                        The Platform and its original content (excluding Content provided by users), features, and functionality are and will remain the exclusive property of AltMe and its licensors.
                        </p>

                        <h3>2.1. User-Generated Content</h3>
                        <p>
                        You are responsible for the Content that you post on or through the Platform, including its legality, reliability, and appropriateness. By posting Content, you grant us the right and license to use, modify, publicly perform, publicly display, reproduce, and distribute such Content on and through the Platform for the purposes of operating and providing the Platform services.
                        </p>

                        <h3>2.2. Copyright for Delivered Work</h3>
                        <p>
                            The copyright and intellectual property rights of the photos, videos, and other media delivered by a Photographer to a Client ("Delivered Work") are handled based on the option selected by the Client when creating a project request.
                        </p>
                        <ul>
                            <li>
                                <strong>Grant of License (Default):</strong> Unless the "Transfer of Copyright" option is selected, the Photographer (the "Seller") retains all intellectual property rights to the Delivered Work. The Photographer grants the Client (the "Buyer") an exclusive, perpetual, irrevocable, worldwide, non-transferable license to use the Delivered Work for any purpose, excluding any unlawful use.
                            </li>
                            <li>
                                <strong>Transfer of Copyright (Buyout):</strong> If the Client selects the "Transfer of Copyright (Buyout)" option and the Photographer accepts the project, upon full payment to the Photographer, all intellectual property rights to the DeliveredWork, including copyright, shall be automatically and irrevocably transferred from the Photographer to the Client. The Photographer agrees to do all things reasonably necessary to perfect such transfer of rights.
                            </li>
                        </ul>

                        <h2>3. Payments and Fees</h2>
                        <p>
                        When a Client hires a Photographer, a service fee of 15% is added to the total project cost. The total amount is held in escrow and released to the Photographer upon the Client's approval of the delivered work.
                        </p>

                        <h2>4. Termination</h2>
                        <p>
                        We may terminate or suspend your account immediately, without prior notice or liability, for any reason whatsoever, including without limitation if you breach the Terms.
                        </p>
                        
                        <h2>5. Disclaimer</h2>
                        <p>
                            Your use of the Platform is at your sole risk. The Platform is provided on an "AS IS" and "AS IS AVAILABLE" basis. The content of these Terms is for informational purposes only and does not constitute legal advice. You should consult with a legal professional for advice on your specific situation.
                        </p>

                        <h2>6. Governing Law</h2>
                        <p>
                        These Terms shall be governed and construed in accordance with the laws of the jurisdiction in which AltMe operates, without regard to its conflict of law provisions.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
      </main>
  );
};

export default TermsOfServicePage;
