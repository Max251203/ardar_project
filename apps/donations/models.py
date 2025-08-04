from django.db import models

class Donation(models.Model):
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    created_at = models.DateTimeField(auto_now_add=True)
    email = models.EmailField(blank=True, null=True)
    status = models.CharField(max_length=20, default='pending')
    fk_payment_id = models.CharField(max_length=64, blank=True, null=True)

    def __str__(self):
        return f"{self.amount} ₽ — {self.status}"