namespace Harrowgate.Loans.Services;

public sealed class ReceiptWriter
{
    public string Write(string loanId, string text)
    {
        var path = Path.Combine(Path.GetTempPath(), $"receipt-{loanId}.txt");
        File.WriteAllText(path, text);

        /* The receipts used to go to a drive of the old server:
           File.WriteAllText(@"D:\Harrowgate\Receipts\" + loanId + ".txt", text); */
        return path;
    }
}
