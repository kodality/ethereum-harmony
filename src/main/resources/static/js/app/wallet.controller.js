/**
 * Render home page.
 *  - show blockchain tree chart;
 *  - show blockchain info
 */

(function() {
    'use strict';

    var ETH_BASE = 1000000000;
    var defaultCurrency = 'wei';   // otherwise need to convert

    /**
     * @example 1000 -> "1,000"
     */
    function numberWithCommas(x) {
        var arr = x.toString().split('.');
        var arr1 = arr[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
        return arr.length == 1 ? arr1 : arr1 + '.' + arr[1];
    }

    function hexToInt(hexValue) {
        return parseInt(remove0x(hexValue), 16);
    }

    function remove0x(value) {
        return (value && value.indexOf('0x') == 0) ? value.substr(2) : value;
    }

    function add0x(value) {
        return '0x' + remove0x(value);
    }

    function showErrorToastr(topMessage, bottomMessage) {
        toastr.clear()
        toastr.options = {
            "positionClass": "toast-top-right",
            "closeButton": true,
            "progressBar": true,
            "showEasing": "swing",
            "timeOut": "4000"
        };
        toastr.error('<strong>' + topMessage + '</strong> <br/><small>' + bottomMessage + '</small>');
    }


    function WalletCtrl($scope, $timeout, $stomp, $http, jsonrpc, $q, scrollConfig) {
        $scope.scrollConfig = jQuery.extend(true, {}, scrollConfig);

        $scope.totalAmount = 0;
        $scope.totalAmountString = 0;
        $scope.totalAmountUSD = 'n/a';
        $scope.addresses = [];
        $scope.txData = {};

        $scope.importAddressData = {};
        $scope.newAddressData = {};

        $scope.onSendClick = function(item) {
            console.log('onSendClick');
            $scope.txData = {
                fromAddress:    item.publicAddress,
                toAddress:      '',
                amount:         0,
                useKeystoreKey: item.hasKeystoreKey
            };
            $('#sendAmountModal').modal({});
        };

        $scope.onRemoveClick = function(item) {
            console.log('onRemoveClick');

            $stomp.send('/app/removeAddress', {
                value:      item.publicAddress
            });
        };

        $scope.onNewAddress = function() {
            console.log('onNewAddress');

            $scope.newAddressData = {
                password:   '',
                name:       ''
            };
            $('#newAddressModal').modal({});
        };

        $scope.onImportAddress = function() {
            console.log('onImportAddress');

            $scope.importAddressData = {
                address:    '',
                name:       ''
            };
            $('#importAddressModal').modal({});
        };

        $scope.onImportAddressConfirmed = function() {
            console.log('onImportAddressConfirmed');
            $stomp.send('/app/importAddress', $scope.importAddressData);

            $('#importAddressModal').modal('hide');
        };

        $scope.onSignAndSend = function() {
            var secret = $('#pkeyInput').val();
            var amount = parseFloat($scope.txData.amount) * Math.pow(10, 18);
            var txData = $scope.txData;

            console.log('Before sign and send amount:' + amount);
            console.log(txData);

            $q.all([
                jsonrpc.request('eth_gasPrice', []),
                jsonrpc.request('eth_getTransactionCount', [add0x(txData.fromAddress), 'latest'])
            ])
                .then(function(results) {
                    console.log(results);

                    var gasPrice = parseInt(remove0x(results[0]), 16);
                    var nonce = parseInt(remove0x(results[1]), 16);
                    var gasLimit =  21000;

                    console.log('txData.useKeystoreKey ' + txData.useKeystoreKey)
                    if (txData.useKeystoreKey) {
                        console.log('try to unlock account with ' + [add0x(txData.fromAddress), secret, null]);
                        return jsonrpc.request('personal_unlockAccount', [add0x(txData.fromAddress), secret, null])
                            .then(function(result) {
                                console.log('Account unlocked ' + result);

                                return jsonrpc.request('eth_sendTransactionArgs', [
                                    add0x(txData.fromAddress),
                                    add0x(txData.toAddress),
                                    add0x(gasLimit.toString(16)),
                                    add0x(gasPrice.toString(16)),
                                    add0x(amount.toString(16)),
                                    add0x(''),
                                    add0x(nonce.toString(16))
                                ]);
                            })
                    } else {
                        return RlpBuilder
                            .balanceTransfer(remove0x(txData.toAddress))
                            .from(remove0x(txData.fromAddress))
                            .secretKey(secret)
                            .gasLimit(gasLimit)
                            .gasPrice(gasPrice)
                            .value(amount, defaultCurrency)
                            .nonce(nonce)
                            .withData('')
                            .format()

                            .then(function (rlp) {
                                console.log('Signed transaction');
                                console.log(rlp);

                                return jsonrpc.request('eth_sendRawTransaction', [rlp]);
                                //.catch(function(error) {
                                //    console.log('Error sending raw transaction');
                                //    console.log(error);
                                //    showErrorToastr('ERROR', 'Wasn\'t to send signed raw transaction.\n' + error);
                                //});
                            });
                    }

                })
                .then(function(txHash) {
                    console.log('eth_sendRawTransaction result:' + txHash);

                    $('#sendAmountModal').modal('hide');
                    // load updated state
                    $stomp.send('/app/getWalletInfo');

                    return jsonrpc.request('ethj_getTransactionReceipt', [txHash]);
                })
                .then(function(txReceipt) {
                    console.log('ethj_getTransactionReceipt result');
                    console.log(txReceipt);

                    var errorMessage = txReceipt ? txReceipt.error : 'Unknown error during load transaction receipt.';
                    if (errorMessage) {
                        showErrorToastr(errorMessage);
                    }
                })
                .catch(function(error) {
                    console.log('Error signing tx');
                    console.log(error);
                    showErrorToastr('ERROR', 'Problem with transfer.\n' + error);
                })
                //.always(function() {
                //    if (txData.useKeystoreKey) {
                //        jsonrpc.request('personal_lockAccount', [add0x(txData.fromAddress)]);
                //    }
                //})
                //.catch(function(e) {
                //    console.log('Problem locking key at the end')
                //});
        };

        function resizeContainer() {
            console.log('Wallet page resize');

            var scrollContainer = document.getElementById("address-scroll-container");
            var rect = scrollContainer.getBoundingClientRect();
            var newHeight = $(window).height() - rect.top - 30;
            //$(scrollContainer).css('maxHeight', newHeight + 'px');
            $timeout(function() {
                $scope.scrollConfig.setHeight = newHeight;
                $(scrollContainer).mCustomScrollbar($scope.scrollConfig);
            }, 10);
        }

        $scope.$on('walletInfoEvent', function(event, data) {
            console.log('walletInfoEvent');
            console.log(data);

            $timeout(function() {
                $scope.totalAmount = data.totalAmount;
                $scope.totalAmountString = numberWithCommas(data.totalAmount / ETH_BASE);
                data.addresses.forEach(function(a) {
                    a.amount = numberWithCommas(a.amount / ETH_BASE);
                });
                $scope.addresses = data.addresses;
            }, 10);

            $http({
                method: 'GET',
                url: 'https://coinmarketcap-nexuist.rhcloud.com/api/eth'
            }).then(function(result) {
                try {
                    var price = result.data.price.usd;
                    $scope.totalAmountUSD = numberWithCommas((data.totalAmount / ETH_BASE) * price);
                } catch (e) {

                }
            })
        });


        $(window).ready(function() {
            // force cleaning pkey value when modal closed
            $('#sendAmountModal').on('hidden.bs.modal', function () {
                $('#pkeyInput').val('');
            });

            // Every time a modal is shown, if it has an autofocus element, focus on it.
            $('.modal').on('shown.bs.modal', function() {
                $(this).find('[autofocus]').focus();
            });

            resizeContainer();
        });
        $scope.$on('windowResizeEvent', resizeContainer);
    }

    angular.module('HarmonyApp')
        .controller('WalletCtrl', ['$scope', '$timeout', '$stomp', '$http', 'jsonrpc', '$q', 'scrollConfig', WalletCtrl])

})();