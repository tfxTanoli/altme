
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

const PrivacyPolicyPage: React.FC = () => {
  return (
      <main className="flex-1 bg-muted/40 p-4 md:p-8 lg:p-12">
        <div className="mx-auto max-w-4xl">
            <Card>
                <CardHeader className="text-center">
                    <CardTitle className="text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</CardTitle>
                    <CardDescription className="mt-4 text-lg">
                        Last updated: November 27, 2025
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="prose prose-lg mx-auto max-w-none dark:prose-invert prose-headings:font-semibold prose-a:text-primary">
                        <p>
                        AltMe ("us", "we", or "our") operates the AltMe website (the "Service"). This page informs you of our policies regarding the collection, use, and disclosure of personal data when you use our Service and the choices you have associated with that data.
                        </p>
                        
                        <h2>1. Information Collection and Use</h2>
                        <p>
                        We collect several different types of information for various purposes to provide and improve our Service to you. This includes, but is not limited to, your name, email address, portfolio content, and project details.
                        </p>

                        <h2>2. Use of Data</h2>
                        <p>
                        AltMe uses the collected data for various purposes:
                        </p>
                        <ul>
                            <li>To provide and maintain our Service</li>
                            <li>To notify you about changes to our Service</li>
                            <li>To allow you to participate in interactive features of our Service when you choose to do so</li>
                            <li>To provide customer support</li>
                            <li>To gather analysis or valuable information so that we can improve our Service</li>
                            <li>To monitor the usage of our Service</li>
                        </ul>

                        <h2>3. Data Security</h2>
                        <p>
                        The security of your data is important to us, but remember that no method of transmission over the Internet or method of electronic storage is 100% secure. While we strive to use commercially acceptable means to protect your Personal Data, we cannot guarantee its absolute security.
                        </p>

                        <h2>4. Service Providers</h2>
                        <p>
                        We may employ third-party companies and individuals to facilitate our Service ("Service Providers"), provide the Service on our behalf, perform Service-related services, or assist us in analyzing how our Service is used. These third parties have access to your Personal Data only to perform these tasks on our behalf and are obligated not to disclose or use it for any other purpose.
                        </p>

                        <h2>5. Links to Other Sites</h2>
                        <p>
                        Our Service may contain links to other sites that are not operated by us. If you click a third-party link, you will be directed to that third party's site. We strongly advise you to review the Privacy Policy of every site you visit.
                        </p>

                        <h2>6. Changes to This Privacy Policy</h2>
                        <p>
                        We may update our Privacy Policy from time to time. We will notify you of any changes by posting the new Privacy Policy on this page. You are advised to review this Privacy Policy periodically for any changes.
                        </p>
                        
                        <h2>7. Contact Us</h2>
                        <p>
                        If you have any questions about this Privacy Policy, please <Link href="/contact">contact us</Link>.
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
      </main>
  );
};

export default PrivacyPolicyPage;
