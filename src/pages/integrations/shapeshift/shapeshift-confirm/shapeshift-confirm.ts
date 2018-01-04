import { Component } from '@angular/core';
import { NavController, NavParams } from 'ionic-angular';
import { Logger } from '@nsalaun/ng-logger';
import * as moment from 'moment';
import * as _ from 'lodash';

// Pages
import { ShapeshiftPage } from '../shapeshift';

// Providers
import { BwcProvider } from '../../../../providers/bwc/bwc';
import { BwcErrorProvider } from '../../../../providers/bwc-error/bwc-error';
import { ConfigProvider } from '../../../../providers/config/config';
import { ExternalLinkProvider } from '../../../../providers/external-link/external-link';
import { OnGoingProcessProvider } from "../../../../providers/on-going-process/on-going-process";
import { PlatformProvider } from '../../../../providers/platform/platform';
import { PopupProvider } from '../../../../providers/popup/popup';
import { ProfileProvider } from '../../../../providers/profile/profile';
import { ShapeshiftProvider } from '../../../../providers/shapeshift/shapeshift';
import { TxFormatProvider } from '../../../../providers/tx-format/tx-format';
import { WalletProvider } from '../../../../providers/wallet/wallet';

@Component({
  selector: 'page-shapeshift-confirm',
  templateUrl: 'shapeshift-confirm.html',
})
export class ShapeshiftConfirmPage {

  private amount: number;
  private currency: string;
  private fromWalletId: string;
  private toWalletId: string;
  private createdTx: any;
  private message: string;
  private configWallet: any;
  private bitcore: any;
  private bitcoreCash: any;
  private useSendMax: boolean;

  public currencyIsoCode: string;
  public isCordova: boolean;
  public sendStatus: string;
  public toWallet: any;
  public fromWallet: any;
  public fiatWithdrawal: number;
  public fiatAmount: number;
  public fiatFee: number;
  public fiatTotalAmount: number;
  public shapeInfo: any;
  public amountUnitStr: string;
  public feeRatePerStr: string;
  public amountStr: string;
  public withdrawalStr: string;
  public feeStr: string;
  public totalAmountStr: string;
  public txSent: any;
  public network: string;

  constructor(
    private bwcProvider: BwcProvider,
    private bwcErrorProvider: BwcErrorProvider,
    private configProvider: ConfigProvider,
    private externalLinkProvider: ExternalLinkProvider,
    private onGoingProcessProvider: OnGoingProcessProvider,
    private logger: Logger,
    private navCtrl: NavController,
    private navParams: NavParams,
    private platformProvider: PlatformProvider,
    private popupProvider: PopupProvider,
    private profileProvider: ProfileProvider,
    private shapeshiftProvider: ShapeshiftProvider,
    private txFormatProvider: TxFormatProvider,
    private walletProvider: WalletProvider
  ) {
    this.configWallet = this.configProvider.get().wallet;
    this.currencyIsoCode = 'USD';  // Only USD
    this.isCordova = this.platformProvider.isCordova;
    this.bitcore = this.bwcProvider.getBitcore();
    this.bitcoreCash = this.bwcProvider.getBitcoreCash();

    this.useSendMax = this.navParams.data.useSendMax ? true : false;

    this.amount = this.navParams.data.amount / 1e8;
    this.currency = this.navParams.data.currency;
    this.fromWalletId = this.navParams.data.walletId;
    this.toWalletId = this.navParams.data.toWalletId;

    this.network = this.shapeshiftProvider.getNetwork();
    this.fromWallet = this.profileProvider.getWallet(this.fromWalletId);
    this.toWallet = this.profileProvider.getWallet(this.toWalletId);

    if (_.isEmpty(this.fromWallet) || _.isEmpty(this.toWallet)) {
      this.showErrorAndBack(null, 'No wallet found'); // TODO: gettextCatalog
      return;
    }

    this.shapeshiftProvider.getLimit(this.getCoinPair(), (err: any, lim: any) => {
      let min = Number(lim.min);
      let max = Number(lim.limit);

      if (this.useSendMax) this.amount = max;

      let amountNumber = Number(this.amount);

      if (amountNumber < min) {
        this.showErrorAndBack(null, 'Minimum amount required is ' + min); // TODO: gettextCatalog
        return;
      }
      if (amountNumber > max) {
        this.showErrorAndBack(null, 'Maximum amount allowed is ' + max); // TODO: gettextCatalog
        return;
      }
      this.createShift();
    });
  }

  ionViewDidLoad() {
    this.logger.info('ionViewDidLoad ShapeshiftConfirmPage');
  }

  public openExternalLink(url: string) {
    this.externalLinkProvider.open(url);
  };

  private showErrorAndBack(title: string, msg: any) {
    title = title ? title : 'Error'; // TODO: gettextCatalog
    this.sendStatus = '';
    this.logger.error(msg);
    msg = (msg && msg.errors) ? msg.errors[0].message : msg;
    this.popupProvider.ionicAlert(title, msg).then(() => {
      this.navCtrl.pop();
    });
  };

  private publishAndSign(wallet: any, txp: any, onSendStatusChange: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!wallet.canSign() && !wallet.isPrivKeyExternal()) {
        let err = 'No signing proposal: No private key'; // TODO: gettextCatalog
        this.logger.info(err);
        return reject(err);
      }

      this.walletProvider.publishAndSign(wallet, txp, onSendStatusChange).then((txp: any) => {
        return resolve(txp);
      }).catch((err: any) => {
        return reject(err);
      });
    });
  }

  private statusChangeHandler(processName: string, showName: string, isOn: boolean) {
    this.logger.debug('statusChangeHandler: ', processName, showName, isOn);
    if (processName == 'sendingTx' && !isOn) {
      this.sendStatus = 'success';
    } else if (showName) {
      this.sendStatus = showName;
    }
  }

  private satToFiat(coin: string, sat: number, isoCode: string): Promise<any> {
    return new Promise((resolve, reject) => {
      this.txFormatProvider.toFiat(coin, sat, isoCode).then((value: any) => {
        return resolve(value);
      });
    });
  }

  private setFiatTotalAmount(amountSat: number, feeSat: number, withdrawalSat: number) {
    this.satToFiat(this.toWallet.coin, withdrawalSat, this.currencyIsoCode, ).then((w: any) => {
      this.fiatWithdrawal = Number(w);

      this.satToFiat(this.fromWallet.coin, amountSat, this.currencyIsoCode, ).then((a: any) => {
        this.fiatAmount = Number(a);

        this.satToFiat(this.fromWallet.coin, feeSat, this.currencyIsoCode, ).then((i: any) => {
          this.fiatFee = Number(i);

          this.fiatTotalAmount = this.fiatAmount + this.fiatFee;
        });
      });
    });
  }

  private saveShapeshiftData(): void {
    let address = this.shapeInfo.deposit;
    let now = moment().unix() * 1000;

    this.shapeshiftProvider.getStatus(address, (err: any, st: any) => {
      let newData = {
        address: address,
        status: st.status,
        date: now,
        amount: this.amountStr,
        title: this.fromWallet.coin.toUpperCase() + ' to ' + this.toWallet.coin.toUpperCase()
      };

      this.shapeshiftProvider.saveShapeshift(newData, null, (err: any) => {
        this.logger.debug("Saved shift with status: " + newData.status);
      });
    });
  }

  private createTx(wallet: any, toAddress: string): Promise<any> {
    return new Promise((resolve, reject) => {
      let parsedAmount = this.txFormatProvider.parseAmount(wallet.coin, this.amount, this.currency);
      this.amountUnitStr = parsedAmount.amountUnitStr;

      this.message = 'ShapeShift: ' + this.fromWallet.coin.toUpperCase() + ' to ' + this.toWallet.coin.toUpperCase();
      let outputs = [];

      outputs.push({
        'toAddress': toAddress,
        'amount': parsedAmount.amountSat,
        'message': this.message
      });

      let txp = {
        toAddress: toAddress,
        amount: parsedAmount.amountSat,
        outputs: outputs,
        message: this.message,
        excludeUnconfirmedUtxos: this.configWallet.spendUnconfirmed ? false : true,
        feeLevel: this.configWallet.settings.feeLevel || 'normal',
        customData: {
          'shapeShift': toAddress
        }
      };

      this.walletProvider.createTx(wallet, txp).then((ctxp: any) => {
        return resolve(ctxp);
      }).catch((err: any) => {
        return reject({
          title: 'Could not create transaction', // TODO: gettextCatalog
          message: this.bwcErrorProvider.msg(err)
        });
      });
    });
  }

  private getLegacyAddressFormat(addr: string, coin: string): string {
    if (coin == 'btc') return addr;
    let a = this.bitcoreCash.Address(addr).toObject();
    return this.bitcore.Address.fromObject(a).toString();
  }

  private getNewAddressFormat(addr: string, coin: string): string {
    if (coin == 'btc') return addr;
    let a = this.bitcore.Address(addr).toObject();
    return this.bitcoreCash.Address.fromObject(a).toString();
  }

  private getCoinPair(): string {
    return this.fromWallet.coin + '_' + this.toWallet.coin;
  }

  private createShift(): void {
    this.onGoingProcessProvider.set('connectingShapeshift', true);

    this.walletProvider.getAddress(this.toWallet, false).then((withdrawalAddress: string) => {
      withdrawalAddress = this.getLegacyAddressFormat(withdrawalAddress, this.toWallet.coin);

      this.walletProvider.getAddress(this.fromWallet, false).then((returnAddress: string) => {
        returnAddress = this.getLegacyAddressFormat(returnAddress, this.fromWallet.coin);

        let data = {
          withdrawal: withdrawalAddress,
          pair: this.getCoinPair(),
          returnAddress: returnAddress
        }
        this.shapeshiftProvider.shift(data, (err: any, shapeData: any) => {
          if (err || shapeData.error) {
            this.onGoingProcessProvider.set('connectingShapeshift', false);
            this.showErrorAndBack(null, err || shapeData.error);
            return;
          }

          let toAddress = this.getNewAddressFormat(shapeData.deposit, this.fromWallet.coin);

          this.createTx(this.fromWallet, toAddress).then((ctxp: any) => {
            // Save in memory
            this.createdTx = ctxp;
            this.shapeInfo = shapeData;

            this.shapeshiftProvider.getRate(this.getCoinPair(), (err: any, r: any) => {
              this.onGoingProcessProvider.set('connectingShapeshift', false);
              let rateUnit = r.rate;
              let amountUnit = this.txFormatProvider.satToUnit(ctxp.amount);
              let withdrawalSat = Number((rateUnit * amountUnit * 100000000).toFixed());

              // Fee rate
              let per = (ctxp.fee / (ctxp.amount + ctxp.fee) * 100);
              this.feeRatePerStr = per.toFixed(2) + '%';

              // Amount + Unit
              this.amountStr = this.txFormatProvider.formatAmountStr(this.fromWallet.coin, ctxp.amount);
              this.withdrawalStr = this.txFormatProvider.formatAmountStr(this.toWallet.coin, withdrawalSat);
              this.feeStr = this.txFormatProvider.formatAmountStr(this.fromWallet.coin, ctxp.fee);
              this.totalAmountStr = this.txFormatProvider.formatAmountStr(this.fromWallet.coin, ctxp.amount + ctxp.fee);

              // Convert to fiat
              this.setFiatTotalAmount(ctxp.amount, ctxp.fee, withdrawalSat);
            });
          }).catch((err: any) => {
            this.onGoingProcessProvider.set('connectingShapeshift', false);
            this.showErrorAndBack(err.title, err.message);
            return;
          });
        });
      }).catch((err: any) => {
        this.onGoingProcessProvider.set('connectingShapeshift', false);
        this.showErrorAndBack(null, 'Could not get address');
        return;
      });
    }).catch((err: any) => {
      this.onGoingProcessProvider.set('connectingShapeshift', false);
      this.showErrorAndBack(null, 'Could not get address');
      return;
    });
  }

  public confirmTx(): void {
    if (!this.createdTx) {
      this.showErrorAndBack(null, 'Transaction has not been created'); // TODO: gettextCatalog
      return;
    }
    let fromCoin = this.fromWallet.coin.toUpperCase();
    let toCoin = this.toWallet.coin.toUpperCase();
    let title = 'Confirm to shift ' + fromCoin + ' to ' + toCoin; // TODO: gettextCatalog
    let okText = 'OK'; // TODO: gettextCatalog
    let cancelText = 'Cancel'; // TODO: gettextCatalog
    this.popupProvider.ionicConfirm(title, '', okText, cancelText).then((ok: any) => {
      if (!ok) {
        this.sendStatus = '';
        return;
      }

      this.onGoingProcessProvider.set('sendingTx', true, this.statusChangeHandler);
      this.publishAndSign(this.fromWallet, this.createdTx, function () { }).then((txSent: any) => {
        this.onGoingProcessProvider.set('sendingTx', false, this.statusChangeHandler);
        this.txSent = txSent;
        this.saveShapeshiftData();
      }).catch((err: any) => {
        this.showErrorAndBack(null, 'Could not send transaction'), err; // TODO: gettextCatalog
        return;
      });
    });
  };

  public goBackHome() {
    this.sendStatus = '';
    this.navCtrl.remove(3, 1);
    this.navCtrl.pop();
    this.navCtrl.push(ShapeshiftPage);
  }

}