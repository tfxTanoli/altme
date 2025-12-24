
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const HowItWorksPage: React.FC = () => {
  const clientSteps = [
    {
      title: 'Post a Request',
      description: 'Describe your project, including details like style, budget, and location.',
    },
    {
      title: 'Receive Bids',
      description: 'Talented photographers interested in your project will submit their bids and proposals.',
    },
    {
      title: 'Hire Your Match',
      description: 'Review photographer profiles, portfolios, and bids to select the best fit for your vision. A 15% service fee is added at this stage to cover platform costs and ensure secure transactions.',
    },
    {
      title: 'Collaborate & Pay Securely',
      description: 'Your payment is held securely in escrow. Use our built-in chat to collaborate with your photographer throughout the project.',
    },
    {
      title: 'Approve & Review',
      description: 'If you are satisfied with the delivery, please approve it within 3 days to release the payment. Leave a review to help the community.',
    },
  ];

  const photographerSteps = [
    {
      title: 'Create Your Profile',
      description: 'Showcase your best work by building a stunning portfolio. Add your bio, and service areas to attract clients.',
    },
    {
      title: 'Find Projects',
      description: 'Browse project requests from clients around the world or in your local area.',
    },
    {
      title: 'Submit Your Bid',
      description: 'Place a competitive bid on projects that match your skills. Write a compelling note to stand out from the crowd.',
    },
    {
      title: 'Get Hired & Deliver',
      description: 'Once a client accepts your bid, get to work! Use our platform to communicate and deliver the final files.',
    },
    {
      title: 'Get Paid',
      description: 'After the client approves the delivery, your earnings are added to your balance. Withdraw your funds easily.',
    },
  ];

  return (
      <main className="flex-1 bg-muted/40 p-4 md:p-8">
        <div className="mx-auto max-w-4xl space-y-12">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">How AltMe Works</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              A simple, secure, and streamlined process for both clients and photographers.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
            {/* For Clients */}
            <section>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-2xl">For Clients: Find a Photographer</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-6">
                    {clientSteps.map((step, index) => (
                      <li key={index} className="flex">
                        <div className="flex-shrink-0">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground">
                            <span className="text-sm font-bold">{index + 1}</span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <h4 className="text-lg font-medium">{step.title}</h4>
                          <p className="mt-1 text-muted-foreground">{step.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>

            {/* For Photographers */}
            <section>
              <Card className="h-full">
                <CardHeader>
                  <CardTitle className="text-2xl">For Photographers: Find Work</CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-6">
                    {photographerSteps.map((step, index) => (
                      <li key={index} className="flex">
                        <div className="flex-shrink-0">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent text-accent-foreground">
                            <span className="text-sm font-bold">{index + 1}</span>
                          </div>
                        </div>
                        <div className="ml-4">
                          <h4 className="text-lg font-medium">{step.title}</h4>
                          <p className="mt-1 text-muted-foreground">{step.description}</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          </div>
        </div>
      </main>
  );
};

export default HowItWorksPage;
