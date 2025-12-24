import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableRow, TableHead, TableHeader } from '@/components/ui/table';

const SctPage: React.FC = () => {
  const details = [
    { label: 'Business Operator', value: 'Ayane Yamashita' },
    {
      label: 'Address',
      value: 'We will disclose it without delay if requested.',
    },
    { label: 'Contact', value: 'contact@altmeapp.com' },
    {
      label: 'Service Fee',
      value: 'A 15% service fee is added to the transaction amount agreed upon between the client and the photographer.',
    },
    {
      label: 'Payment Methods',
      value: 'Credit Card',
    },
    {
      label: 'Timing of Payment',
      value: 'Payment is processed when a client hires a photographer for a project.',
    },
    {
      label: 'Service Delivery Time',
      value: 'Services are rendered based on the agreement between the client and the photographer. Digital content is delivered upon project completion.',
    },
    {
      label: 'Returns, Cancellations, and Refunds',
      value: 'Due to the nature of the service, cancellations or refunds after a transaction has been initiated are generally not permitted, except in cases of non-delivery or as mediated in a dispute. Please refer to our Terms of Service for details.',
    },
  ];

  return (
    <main className="flex-1 bg-muted/40 p-4 md:p-8 lg:p-12">
      <div className="mx-auto max-w-4xl">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-3xl font-bold tracking-tight sm:text-4xl">
              Legal Notice
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableBody>
                  {details.map((detail) => (
                    <TableRow key={detail.label}>
                      <TableCell className="font-semibold">{detail.label}</TableCell>
                      <TableCell>{detail.value}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};

export default SctPage;
