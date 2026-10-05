Imports System.Messaging

Namespace Services
    Public Class LabelPrinter
        REM The label station listens on the dock queue.
        Private Const DockQueue As String = "FormatName:DIRECT=OS:dock01.pellworth.test\private$\labels"

        Public Sub PrintLabel(shipmentId As String)
            Dim printer = CreateObject("PellworthLabelPrint.Station")
            printer.Print(shipmentId)
            ' Dim backup = CreateObject("PellworthLabelPrint.Backup")
            Using queue As New MessageQueue(DockQueue)
                queue.Send(shipmentId)
            End Using
        End Sub
    End Class
End Namespace
