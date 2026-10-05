namespace Pellworth.Rates.Api;

public sealed class RateRefresher : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromMinutes(15), stoppingToken);
        }
    }
}
